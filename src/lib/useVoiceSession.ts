import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useDataStore } from '../stores/dataStore';
import { parseKoreanNumber, detectCommand, extractModifyValue } from './koreanNum';
import { SpeechController, speak, cancelTts, isSpeechSupported, formatForTts } from './speech';
import { computeTotalRows, nestedAutoValue } from './autoValue';
import type { Column, Session, SessionRow } from '../types';
import { saveSession } from './db';

/**
 * Orchestrates a full voice-input session.
 * Owns:
 *  - SpeechController (STT)
 *  - TTS queue (speak / cancel)
 *  - Row/Col progression
 *  - Modify / Cancel / End commands
 *  - Persist completed rows to IndexedDB + dataStore
 */
export function useVoiceSession() {
  const ctrlRef = useRef<SpeechController | null>(null);
  const completedRowsRef = useRef<SessionRow[]>([]);
  const sessionIdRef = useRef<string>('');
  const prevRowValuesRef = useRef<Record<string, string> | null>(null);
  /** Field name the app is currently waiting for the user to fill */
  const awaitingFieldRef = useRef<{ row: number; colId: string; name: string } | null>(null);
  /** Last finalized value for the awaiting field, used for "수정" semantics */
  const lastValueRef = useRef<string>('');

  const start = useCallback(async () => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    if (!s.tableGenerated) return false;

    const voiceCols = s.columns.filter((c) => c.mode === 'voice');
    if (voiceCols.length === 0) return false;
    const total = computeTotalRows(s.columns);
    if (total === 0) return false;

    sessionIdRef.current = `sess_${Date.now()}`;
    completedRowsRef.current = [];
    prevRowValuesRef.current = null;
    sess.resetAll();
    sess.setPhase('active');
    sess.setActiveRow(1);
    sess.setActiveCol(0);

    if (!isSpeechSupported()) {
      sess.setLastTts('이 기기는 음성 인식을 지원하지 않습니다.');
      return false;
    }

    // greeting
    await speak('음성 입력을 시작합니다.', { interrupt: true });

    // first announce
    await announceNewRow(1, s.columns, prevRowValuesRef.current);
    prevRowValuesRef.current = buildAutoValues(s.columns, 1);

    // start STT
    ctrlRef.current = new SpeechController({
      onFinal: handleFinal,
      onError: handleError,
    });
    ctrlRef.current.start();

    await announceField(voiceCols[0]);
    return true;
  }, []);

  const stop = useCallback(async (announce = true) => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    cancelTts();
    awaitingFieldRef.current = null;
    if (announce) await speak('입력을 종료합니다.', { interrupt: true });
    useSessionStore.getState().setPhase('ready');
    // persist whatever was completed
    void persistSession();
  }, []);

  const persistSession = useCallback(async () => {
    const s = useSettingsStore.getState();
    const rows = completedRowsRef.current;
    if (rows.length === 0) return;
    const session: Session = {
      id: sessionIdRef.current,
      date: new Date().toISOString().slice(0, 10),
      columns: s.columns,
      rows,
      completedRows: rows.length,
      syncedRows: 0,
      startedAt: parseInt(sessionIdRef.current.replace('sess_', ''), 10),
      finishedAt: Date.now(),
    };
    try {
      await saveSession(session);
    } catch {
      /* ignore — non-critical */
    }
    useDataStore.getState().upsertSession(session);
  }, []);

  // ── handlers ────────────────────────────────────────────────
  const handleFinal = useCallback(async (text: string, _alts: string[]) => {
    const awaiting = awaitingFieldRef.current;
    if (!awaiting) return;

    const cmd = detectCommand(text);

    if (cmd === 'end') {
      await stop(true);
      return;
    }

    if (cmd === 'modify') {
      const modifyVal = extractModifyValue(text);
      if (modifyVal) {
        const col = getColById(awaiting.colId);
        const parsed = parseKoreanNumber(modifyVal, col?.type === 'float' ? col.decimals ?? 1 : undefined);
        if (parsed !== null) {
          recordValue(awaiting.colId, parsed);
          lastValueRef.current = parsed;
          useSessionStore.getState().setRecognized(parsed);
          await speak(`수정 ${awaiting.name} ${formatForTts(parsed)}`, { interrupt: true });
          await advance();
          return;
        }
      }
      // No value provided with the modify command — re-prompt
      await speak(`수정. ${awaiting.name} 다시 말씀해 주세요.`, { interrupt: true });
      return;
    }

    if (cmd === 'cancel' || cmd === 'redo') {
      useSessionStore.getState().setRecognized('');
      await speak(`${awaiting.name} 다시 말씀해 주세요.`, { interrupt: true });
      return;
    }

    // Plain number expected
    const col = getColById(awaiting.colId);
    const parsed = parseKoreanNumber(text, col?.type === 'float' ? col.decimals ?? 1 : undefined);

    if (parsed === null) {
      await speak(`${awaiting.name} 다시 말씀해 주세요.`, { interrupt: true });
      return;
    }

    recordValue(awaiting.colId, parsed);
    lastValueRef.current = parsed;
    useSessionStore.getState().setRecognized(parsed);
    await speak(formatForTts(parsed), { interrupt: true });
    await advance();
  }, [stop]);

  const handleError = useCallback((_kind: string) => {
    // Auto-restart logic is inside SpeechController; just ignore here.
  }, []);

  // ── progression ─────────────────────────────────────────────
  const advance = useCallback(async () => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const voiceCols = s.columns.filter((c) => c.mode === 'voice');
    const row = sess.activeRow;
    const total = computeTotalRows(s.columns);

    if (sess.activeColIdx < voiceCols.length - 1) {
      const nextIdx = sess.activeColIdx + 1;
      sess.setActiveCol(nextIdx);
      sess.setRecognized('');
      await announceField(voiceCols[nextIdx]);
      return;
    }

    // Row complete: persist & advance
    finalizeCurrentRow();
    sess.setPhase('complete');
    await speak(`${row}행 완료.`, { interrupt: true });

    if (row >= total) {
      sess.setPhase('done');
      await speak('모든 입력이 완료되었습니다.', { interrupt: true });
      await stop(false);
      return;
    }

    // Move to next row
    const nextRow = row + 1;
    sess.setActiveRow(nextRow);
    sess.setActiveCol(0);
    sess.resetRowValues();
    sess.setPhase('active');

    await announceNewRow(nextRow, s.columns, prevRowValuesRef.current);
    prevRowValuesRef.current = buildAutoValues(s.columns, nextRow);
    if (voiceCols[0]) await announceField(voiceCols[0]);
  }, [stop]);

  const finalizeCurrentRow = useCallback(() => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const auto = buildAutoValues(s.columns, sess.activeRow);
    const values: Record<string, string> = { ...auto, ...sess.currentRowValues };
    const row: SessionRow = {
      index: sess.activeRow,
      values,
      complete: true,
    };
    completedRowsRef.current = [...completedRowsRef.current, row];
    void persistSession();
  }, [persistSession]);

  // unmount cleanup
  useEffect(() => () => {
    ctrlRef.current?.stop();
    cancelTts();
  }, []);

  return { start, stop };

  // ── inner helpers (closures over the hook scope) ─────────
  function getColById(id: string): Column | null {
    return useSettingsStore.getState().columns.find((c) => c.id === id) || null;
  }
  function recordValue(colId: string, value: string) {
    useSessionStore.getState().setRowValue(colId, value);
  }
  async function announceField(col: Column) {
    awaitingFieldRef.current = {
      row: useSessionStore.getState().activeRow,
      colId: col.id,
      name: col.name,
    };
    useSessionStore.getState().setLastTts(`${col.name} 말씀해 주세요.`);
    await speak(`${col.name}.`, { interrupt: false });
  }
  async function announceNewRow(
    row: number,
    columns: Column[],
    prev: Record<string, string> | null,
  ) {
    const auto = buildAutoValues(columns, row);
    // For row 1, announce all silent+auto values (non-voice) that have TTS enabled.
    // For row > 1, announce only the changed ones.
    const toAnnounce = columns
      .filter((c) => c.mode === 'auto') // 'silent' (자동·무음) excluded
      .filter((c) => {
        if (!prev) return true;
        return prev[c.id] !== auto[c.id];
      })
      .map((c) => `${c.name} ${auto[c.id]}`);

    if (toAnnounce.length) {
      const prefix = row === 1 ? '' : `${row}행. `;
      await speak(`${prefix}${toAnnounce.join(', ')}.`, { interrupt: false });
    } else if (row > 1) {
      await speak(`${row}행.`, { interrupt: false });
    }
  }
}

function buildAutoValues(columns: Column[], row: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.mode === 'voice') continue;
    out[c.id] = nestedAutoValue(columns, c, row);
  }
  return out;
}
