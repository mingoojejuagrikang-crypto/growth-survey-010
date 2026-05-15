import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useDataStore } from '../stores/dataStore';
import { parseKoreanNumber, detectCommand, extractModifyValue } from './koreanNum';
import { SpeechController, speak, cancelTts, isSpeechSupported, formatForTts } from './speech';
import { computeTotalRows, nestedAutoValue } from './autoValue';
import type { Column, Session, SessionRow } from '../types';
import { saveSession } from './db';

interface AwaitingField {
  row: number;
  colId: string;
  name: string;
  /** When true the next final result is treated as the modify value for this field */
  isModify?: boolean;
  /** When isModify, where to return after applying */
  returnIdx?: number;
}

/**
 * Orchestrates a full voice-input session.
 * Public API:
 *   - start(): kick off TTS + STT
 *   - stop(announce): end session
 *   - restartFromCol(colId): jump back to a voice column, clearing it + subsequent values
 */
export function useVoiceSession() {
  const ctrlRef = useRef<SpeechController | null>(null);
  const completedRowsRef = useRef<SessionRow[]>([]);
  const sessionIdRef = useRef<string>('');
  const prevRowValuesRef = useRef<Record<string, string> | null>(null);
  const awaitingFieldRef = useRef<AwaitingField | null>(null);

  // ── helpers ──────────────────────────────────────────────────
  const getTtsRate = () => useSettingsStore.getState().ttsRate || 1.05;

  const say = useCallback(async (text: string, interrupt = true) => {
    await speak(text, { interrupt, rate: getTtsRate() });
  }, []);

  const getColById = useCallback((id: string): Column | null => {
    return useSettingsStore.getState().columns.find((c) => c.id === id) || null;
  }, []);

  const voiceCols = useCallback((): Column[] => {
    return useSettingsStore.getState().columns.filter((c) => c.input === 'voice');
  }, []);

  const recordValue = useCallback((colId: string, value: string) => {
    useSessionStore.getState().setRowValue(colId, value);
  }, []);

  // ── progression helpers ──────────────────────────────────────
  const announceField = useCallback(async (col: Column, opts?: { isModify?: boolean; returnIdx?: number }) => {
    awaitingFieldRef.current = {
      row: useSessionStore.getState().activeRow,
      colId: col.id,
      name: col.name,
      isModify: opts?.isModify,
      returnIdx: opts?.returnIdx,
    };
    let hint = `${col.name} 말씀해 주세요.`;
    if (col.type === 'options' && col.auto.kind === 'options') {
      const sel = col.auto.selected.join(', ');
      if (sel) hint = `${col.name} (${sel} 중 선택) 말씀해 주세요.`;
    }
    useSessionStore.getState().setLastTts(hint);
    if (opts?.isModify) {
      await say(`정정. ${col.name} 다시 말씀해 주세요.`);
    } else {
      await say(`${col.name}.`, false);
    }
  }, [say]);

  const announceNewRow = useCallback(
    async (row: number, columns: Column[], prev: Record<string, string> | null) => {
      const auto = buildAutoValues(columns, row);
      const toAnnounce = columns
        .filter((c) => c.input === 'auto' && c.ttsAnnounce)
        .filter((c) => !prev || prev[c.id] !== auto[c.id])
        .map((c) => `${c.name} ${auto[c.id]}`);

      if (toAnnounce.length) {
        const prefix = row === 1 ? '' : `${row}행. `;
        await say(`${prefix}${toAnnounce.join(', ')}.`, false);
      } else if (row > 1) {
        await say(`${row}행.`, false);
      }
    },
    [say],
  );

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
      /* IDB unavailable — ignore */
    }
    useDataStore.getState().upsertSession(session);
  }, []);

  const finalizeCurrentRow = useCallback(() => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const auto = buildAutoValues(s.columns, sess.activeRow);
    const values: Record<string, string> = { ...auto, ...sess.currentRowValues };
    const row: SessionRow = { index: sess.activeRow, values, complete: true };
    completedRowsRef.current = [...completedRowsRef.current, row];
    void persistSession();
  }, [persistSession]);

  // ── advance to next voice col / next row ─────────────────────
  const advance = useCallback(async () => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const vc = voiceCols();
    const row = sess.activeRow;
    const total = computeTotalRows(s.columns);

    if (sess.activeColIdx < vc.length - 1) {
      const nextIdx = sess.activeColIdx + 1;
      sess.setActiveCol(nextIdx);
      sess.setRecognized('');
      await announceField(vc[nextIdx]);
      return;
    }

    // Row complete
    finalizeCurrentRow();
    sess.setPhase('complete');
    await say(`${row}행 완료.`);

    if (row >= total) {
      sess.setPhase('done');
      await say('모든 입력이 완료되었습니다.');
      await stop(false);
      return;
    }

    const nextRow = row + 1;
    sess.setActiveRow(nextRow);
    sess.setActiveCol(0);
    sess.resetRowValues();
    sess.setPhase('active');

    await announceNewRow(nextRow, s.columns, prevRowValuesRef.current);
    prevRowValuesRef.current = buildAutoValues(s.columns, nextRow);
    if (vc[0]) await announceField(vc[0]);
  }, [announceField, announceNewRow, finalizeCurrentRow, say, voiceCols]);

  // ── modify / restart ─────────────────────────────────────────
  /** Enter modify mode: go back to previous voice col, await new value. */
  const enterModifyMode = useCallback(async (preExtractedValue?: string) => {
    const sess = useSessionStore.getState();
    const vc = voiceCols();
    const curIdx = sess.activeColIdx;
    const targetIdx = Math.max(0, curIdx - 1);
    const target = vc[targetIdx];
    if (!target) return;

    // If user said "수정 X" with a value attached, apply immediately.
    if (preExtractedValue) {
      const parsed = parseValueForCol(target, preExtractedValue);
      if (parsed !== null) {
        recordValue(target.id, parsed);
        sess.setRecognized(parsed);
        await say(`정정 ${target.name} ${formatForTts(parsed)}`);
        // After applying modify, re-announce the column we were originally on
        if (curIdx !== targetIdx) {
          sess.setActiveCol(curIdx);
          if (vc[curIdx]) await announceField(vc[curIdx]);
        } else {
          await advance();
        }
        return;
      }
    }

    // Otherwise enter modify await state
    recordValue(target.id, '');
    sess.setActiveCol(targetIdx);
    sess.setRecognized('');
    await announceField(target, { isModify: true, returnIdx: curIdx });
  }, [advance, announceField, recordValue, say, voiceCols]);

  /** Restart from a specific voice column. Clears that col + subsequent voice values. */
  const restartFromCol = useCallback(async (colId: string) => {
    const sess = useSessionStore.getState();
    const vc = voiceCols();
    const idx = vc.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    for (let i = idx; i < vc.length; i++) {
      recordValue(vc[i].id, '');
    }
    sess.setActiveCol(idx);
    sess.setRecognized('');
    cancelTts();
    awaitingFieldRef.current = null;
    await announceField(vc[idx]);
  }, [announceField, recordValue, voiceCols]);

  // ── final result handler ─────────────────────────────────────
  const handleFinal = useCallback(async (text: string, _alts: string[]) => {
    const awaiting = awaitingFieldRef.current;
    if (!awaiting) return;
    const cmd = detectCommand(text);

    if (cmd === 'end') {
      await stop(true);
      return;
    }

    // Special: if already in modify mode and a plain value arrives, apply it as the modify
    if (awaiting.isModify && cmd === null) {
      const col = getColById(awaiting.colId);
      const parsed = col ? parseValueForCol(col, text) : null;
      if (parsed !== null) {
        recordValue(awaiting.colId, parsed);
        useSessionStore.getState().setRecognized(parsed);
        await say(`정정 ${awaiting.name} ${formatForTts(parsed)}`);
        const returnIdx = awaiting.returnIdx ?? useSessionStore.getState().activeColIdx;
        const vc = voiceCols();
        useSessionStore.getState().setActiveCol(returnIdx);
        useSessionStore.getState().setRecognized('');
        if (vc[returnIdx]) await announceField(vc[returnIdx]);
        return;
      }
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    if (cmd === 'modify') {
      const modifyVal = extractModifyValue(text);
      await enterModifyMode(modifyVal || undefined);
      return;
    }

    if (cmd === 'cancel' || cmd === 'redo') {
      useSessionStore.getState().setRecognized('');
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    // Plain value path
    const col = getColById(awaiting.colId);
    const parsed = col ? parseValueForCol(col, text) : null;
    if (parsed === null) {
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }
    recordValue(awaiting.colId, parsed);
    useSessionStore.getState().setRecognized(parsed);
    await say(formatForTts(parsed));
    await advance();
  }, [advance, announceField, enterModifyMode, getColById, recordValue, say, voiceCols]);

  // ── start / stop ─────────────────────────────────────────────
  const start = useCallback(async () => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    if (!s.tableGenerated) return false;

    const vc = s.columns.filter((c) => c.input === 'voice');
    if (vc.length === 0) return false;
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

    await say('음성 입력을 시작합니다.');

    await announceNewRow(1, s.columns, prevRowValuesRef.current);
    prevRowValuesRef.current = buildAutoValues(s.columns, 1);

    ctrlRef.current = new SpeechController({
      onFinal: handleFinal,
      onError: () => {},
    });
    ctrlRef.current.start();

    await announceField(vc[0]);
    return true;
  }, [announceField, announceNewRow, handleFinal, say]);

  const stop = useCallback(async (announce = true) => {
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    cancelTts();
    awaitingFieldRef.current = null;
    if (announce) await say('입력을 종료합니다.');
    useSessionStore.getState().setPhase('ready');
    void persistSession();
  }, [persistSession, say]);

  // Cleanup
  useEffect(() => () => {
    ctrlRef.current?.stop();
    cancelTts();
  }, []);

  return { start, stop, restartFromCol };
}

// ─── helpers ─────────────────────────────────────────────────
function buildAutoValues(columns: Column[], row: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.input === 'voice') continue;
    out[c.id] = nestedAutoValue(columns, c, row);
  }
  return out;
}

/** Parse a voice transcript into a value appropriate for the column type. */
function parseValueForCol(col: Column, raw: string): string | null {
  if (col.type === 'options' && col.auto.kind === 'options') {
    return matchOption(raw, col.auto.selected.length ? col.auto.selected : col.auto.available);
  }
  if (col.type === 'text') {
    const t = raw.trim();
    return t || null;
  }
  if (col.type === 'date') {
    // simple ISO match; otherwise leave raw
    const m = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return raw.trim() || null;
  }
  // int / float
  const decimals = col.type === 'float' ? col.decimals ?? 1 : col.type === 'int' ? 0 : undefined;
  return parseKoreanNumber(raw, decimals);
}

function matchOption(text: string, allowed: string[]): string | null {
  if (allowed.length === 0) return null;
  const norm = text.trim().toLowerCase().replace(/\s+/g, '');
  for (const v of allowed) {
    if (v.toLowerCase().replace(/\s+/g, '') === norm) return v;
  }
  for (const v of allowed) {
    const vn = v.toLowerCase().replace(/\s+/g, '');
    if (norm.includes(vn) || vn.includes(norm)) return v;
  }
  return null;
}
