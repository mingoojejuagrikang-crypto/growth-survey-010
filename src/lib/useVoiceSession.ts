import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useDataStore } from '../stores/dataStore';
import { parseKoreanNumber, detectCommand, extractModifyValue } from './koreanNum';
import { SpeechController, speak, cancelTts, isSpeechSupported, formatForTts, warmupTts, setActiveController } from './speech';
import { computeTotalRows, buildCyclingValues, nestedAutoValue } from './autoValue';
import type { Column, Session, SessionRow } from '../types';
import { saveSession, saveAudioClip } from './db';
import { AudioRecorder } from './audioRecorder';
import { logger } from './logger';

interface AwaitingField {
  row: number;
  colId: string;
  name: string;
  /** When true the next final result is treated as the modify value */
  isModify?: boolean;
}

export function useVoiceSession() {
  const ctrlRef = useRef<SpeechController | null>(null);
  const sessionIdRef = useRef<string>('');
  const sessionLabelRef = useRef<string | undefined>(undefined);
  const awaitingFieldRef = useRef<AwaitingField | null>(null);
  const epochRef = useRef(0);
  const lastConfidenceRef = useRef<number>(1);
  const recorderRef = useRef<AudioRecorder | null>(null);
  const clipStartRowRef = useRef<number>(0);
  const clipStartColIdRef = useRef<string>('');
  // rowIndex → colId → IDB key; accumulated in-memory until persistSession writes to dataStore
  const pendingClipsRef = useRef<Record<number, Record<string, string>>>({});

  // ── helpers ────────────────────────────────────────────────
  const getTtsRate = () => useSettingsStore.getState().ttsRate || 1.05;
  const say = useCallback(async (text: string, interrupt = true) => {
    if (!text) return;
    const ttsStart = Date.now();
    let startDelayMs: number | null = null;
    await speak(text, {
      interrupt,
      rate: getTtsRate(),
      onStart: (d) => { startDelayMs = d; },
    });
    logger.log({
      type: 'tts',
      ttsText: text,
      durationMs: Date.now() - ttsStart,
      startDelayMs,
      sessionId: sessionIdRef.current,
      row: useSessionStore.getState().activeRow,
    });
  }, []);

  const getColById = (id: string): Column | null =>
    useSettingsStore.getState().columns.find((c) => c.id === id) || null;

  const voiceColsList = (): Column[] =>
    useSettingsStore.getState().columns.filter((c) => c.input === 'voice');

  const isRowVoiceComplete = (row: number, vCols: Column[]): boolean => {
    if (useSessionStore.getState().isRowComplete(row)) return true;
    const values = useSessionStore.getState().getRowValues(row);
    return vCols.every((c) => {
      const v = values[c.id];
      return v !== undefined && v !== '';
    });
  };

  const firstIncompleteColIdx = (row: number, vCols: Column[]): number => {
    const values = useSessionStore.getState().getRowValues(row);
    for (let i = 0; i < vCols.length; i++) {
      const v = values[vCols[i].id];
      if (v === undefined || v === '') return i;
    }
    return 0;
  };

  const findNextIncompleteRow = (start: number, total: number, vCols: Column[]): number | null => {
    for (let r = start; r <= total; r++) {
      if (!isRowVoiceComplete(r, vCols)) return r;
    }
    for (let r = 1; r < start; r++) {
      if (!isRowVoiceComplete(r, vCols)) return r;
    }
    return null;
  };

  // ── persistence ────────────────────────────────────────────
  const persistSession = useCallback(async () => {
    const settings = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const completed = [...sess.completedRows].sort((a, b) => a - b);
    if (completed.length === 0) return;
    const rows: SessionRow[] = completed.map((r) => {
      const auto = buildCyclingValues(settings.columns, r);
      const fixedAndAuto = autoNonCyclingValues(settings.columns, r);
      const voiceVals = sess.getRowValues(r);
      // Merge stored clips (from previous persists) with newly recorded clips
      const existingSession = useDataStore.getState().sessions.find(
        (s) => s.id === sessionIdRef.current,
      );
      const existingRow = existingSession?.rows.find((row) => row.index === r);
      const mergedClips = {
        ...(existingRow?.audioClips ?? {}),
        ...(pendingClipsRef.current[r] ?? {}),
      };
      return {
        index: r,
        values: { ...fixedAndAuto, ...auto, ...voiceVals },
        complete: true,
        audioClips: Object.keys(mergedClips).length > 0 ? mergedClips : undefined,
      };
    });
    const session: Session = {
      id: sessionIdRef.current,
      date: new Date().toISOString().slice(0, 10),
      label: sessionLabelRef.current,
      columns: settings.columns,
      rows,
      completedRows: rows.length,
      syncedRows: 0,
      startedAt: parseInt(sessionIdRef.current.replace('sess_', ''), 10),
      finishedAt: Date.now(),
    };
    try { await saveSession(session); } catch { /* ignore */ }
    useDataStore.getState().upsertSession(session);
  }, []);

  // ── announcements ──────────────────────────────────────────
  /** Announce only auto+ttsAnnounce columns whose value differs between rows. */
  const announceRowDiff = useCallback(
    async (fromRow: number | null, toRow: number) => {
      const cols = useSettingsStore.getState().columns;
      const toAuto = buildCyclingValues(cols, toRow);
      const fromAuto = fromRow != null ? buildCyclingValues(cols, fromRow) : null;
      const parts: string[] = [];
      for (const c of cols) {
        if (c.input !== 'auto' || !c.ttsAnnounce) continue;
        const tv = toAuto[c.id] ?? '';
        const fv = fromAuto?.[c.id] ?? '';
        if (!tv) continue;
        if (fromAuto === null || fv !== tv) parts.push(`${c.name} ${tv}`);
      }
      if (parts.length) await say(parts.join(', ') + '.', false);
    },
    [say],
  );

  const announceField = useCallback(
    async (col: Column, opts?: { isModify?: boolean }) => {
      const row = useSessionStore.getState().activeRow;
      awaitingFieldRef.current = {
        row,
        colId: col.id,
        name: col.name,
        isModify: opts?.isModify,
      };
      const hint = opts?.isModify
        ? `정정. ${col.name} 다시 말씀해 주세요.`
        : `${col.name} 말씀해 주세요.`;
      useSessionStore.getState().setLastTts(hint);
      await say(opts?.isModify ? `정정. ${col.name}.` : `${col.name}.`, false);
      // Start recording clip after TTS ends
      clipStartRowRef.current = row;
      clipStartColIdRef.current = col.id;
      recorderRef.current?.startClip();
    },
    [say],
  );

  // ── progression ────────────────────────────────────────────
  /** Move to next voice col in current row, or finalize row + jump to next target. */
  const advance = useCallback(async () => {
    const settings = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const vc = voiceColsList();
    const row = sess.activeRow;
    const total = computeTotalRows(settings.columns);

    // Still voice cols in this row?
    const nextIdx = sess.activeColIdx + 1;
    if (nextIdx < vc.length) {
      // Skip cols already filled with non-empty values (empty string = cleared by modify)
      const values = sess.getRowValues(row);
      let target = nextIdx;
      while (target < vc.length) {
        const v = values[vc[target].id];
        if (v === undefined || v === '') break;
        target++;
      }
      if (target < vc.length) {
        sess.setActiveCol(target);
        sess.setRecognized('');
        await announceField(vc[target]);
        return;
      }
    }

    // All voice cols in this row filled — complete
    sess.markRowComplete(row);
    sess.setPhase('complete');
    void persistSession();
    await say(`${row}행 완료.`, false); // false: 에코 TTS 뒤에 큐잉 (에코 캔슬 방지)

    // If returnRow set (came from modify/jump), go back
    const ret = sess.returnRow;
    const retCol = sess.returnColIdx;
    if (ret != null && ret !== row) {
      sess.setReturn(null, null);
      const targetCol = retCol ?? firstIncompleteColIdx(ret, vc);
      sess.setActiveRow(ret);
      sess.setActiveCol(targetCol);
      sess.setRecognized('');
      sess.setPhase('active');
      await announceRowDiff(row, ret);
      if (vc[targetCol]) await announceField(vc[targetCol]);
      return;
    }

    // Otherwise find next incomplete row
    const next = findNextIncompleteRow(row + 1, total, vc);
    if (next === null) {
      sess.setPhase('done');
      await say('모든 입력이 완료되었습니다.');
      await stop(false);
      return;
    }

    sess.setActiveRow(next);
    const targetCol = firstIncompleteColIdx(next, vc);
    sess.setActiveCol(targetCol);
    sess.setRecognized('');
    sess.setPhase('active');
    await announceRowDiff(row, next);
    if (vc[targetCol]) await announceField(vc[targetCol]);
  }, [announceField, announceRowDiff, persistSession, say]);

  // ── modify (cross-row) ─────────────────────────────────────
  const enterModifyMode = useCallback(async (preExtractedValue?: string) => {
    const sess = useSessionStore.getState();
    const vc = voiceColsList();
    const curRow = sess.activeRow;
    const curIdx = sess.activeColIdx;

    // Find previous voice col (could be in previous row)
    let targetRow = curRow;
    let targetIdx = curIdx - 1;
    if (targetIdx < 0) {
      if (curRow <= 1) {
        // No previous — treat as redo current
        sess.setRowValue(curRow, vc[curIdx].id, '');
        sess.setRecognized('');
        await announceField(vc[curIdx]);
        return;
      }
      targetRow = curRow - 1;
      targetIdx = vc.length - 1;
    }

    // Pre-extracted value? Apply directly.
    const target = vc[targetIdx];
    if (preExtractedValue) {
      const parsed = parseValueForCol(target, preExtractedValue);
      if (parsed !== null) {
        sess.setRowValue(targetRow, target.id, parsed);
        // If we modified an earlier row, make sure it's still complete
        if (targetRow < curRow) {
          // Persist updated row
          void persistSession();
        }
        sess.setRecognized(parsed);
        await say(`정정 ${target.name} ${formatForTts(parsed)}`);
        // Return immediately to where we were
        sess.setActiveRow(curRow);
        sess.setActiveCol(curIdx);
        if (vc[curIdx]) await announceField(vc[curIdx]);
        return;
      }
    }

    // Otherwise prepare modify-await on the target column
    // Important: don't clear the previous value yet; wait for new input.
    // But UI shows recognized blank.
    if (targetRow !== curRow) {
      // mark target row incomplete so it gets re-completed once modified
      sess.markRowIncomplete(targetRow);
    }
    // v5.2 8-2: returnRow 체인 보호 — 칩 이동 중에 수정 명령이 들어온 경우
    // 기존 returnRow를 덮어쓰지 않고 유지하여 수정 완료 후에도 원래 위치로 복귀
    const existingReturnRow = sess.returnRow;
    const existingReturnCol = sess.returnColIdx;
    if (existingReturnRow != null) {
      // 칩 이동 흐름 중 — 기존 returnRow 유지
      sess.setReturn(existingReturnRow, existingReturnCol);
    } else {
      // 통상 흐름 — 현재 위치로 복귀
      sess.setReturn(curRow, curIdx);
    }
    sess.setActiveRow(targetRow);
    sess.setActiveCol(targetIdx);
    sess.setRowValue(targetRow, target.id, '');
    sess.setRecognized('');
    await announceField(target, { isModify: true });
  }, [announceField, persistSession, say]);

  // ── skip ───────────────────────────────────────────────────
  const skipRow = useCallback(async () => {
    const settings = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const vc = voiceColsList();
    const row = sess.activeRow;
    const total = computeTotalRows(settings.columns);
    // Mark all voice cols in current row as empty strings to indicate skipped
    for (const c of vc) {
      sess.setRowValue(row, c.id, '');
    }
    sess.markRowComplete(row);
    void persistSession();
    await say('건너뜁니다.');
    // Move to next incomplete row
    const next = findNextIncompleteRow(row + 1, total, vc);
    if (next === null) {
      sess.setPhase('done');
      await say('모든 입력이 완료되었습니다.');
      await stop(false);
      return;
    }
    sess.setActiveRow(next);
    const targetCol = firstIncompleteColIdx(next, vc);
    sess.setActiveCol(targetCol);
    sess.setRecognized('');
    await announceRowDiff(row, next);
    if (vc[targetCol]) await announceField(vc[targetCol]);
  }, [announceField, announceRowDiff, persistSession, say]);

  // ── public: restart from a voice col (chip tap) ────────────
  const restartFromCol = useCallback(async (colId: string) => {
    const sess = useSessionStore.getState();
    const vc = voiceColsList();
    const idx = vc.findIndex((c) => c.id === colId);
    if (idx < 0) return;
    const row = sess.activeRow;
    // Clear this and subsequent voice values in the current row
    for (let i = idx; i < vc.length; i++) {
      sess.setRowValue(row, vc[i].id, '');
    }
    sess.markRowIncomplete(row);
    sess.setActiveCol(idx);
    sess.setRecognized('');
    cancelTts();
    // v5.2: bump epoch so in-flight handleFinal's advance() guard aborts
    epochRef.current++;
    awaitingFieldRef.current = null;
    await announceField(vc[idx]);
  }, [announceField]);

  // ── public: jump to a specific row (auto-chip change) ──────
  const jumpToRow = useCallback(
    async (targetRow: number, options?: { setReturn?: boolean }) => {
      const settings = useSettingsStore.getState();
      const sess = useSessionStore.getState();
      const vc = voiceColsList();
      const total = computeTotalRows(settings.columns);
      if (targetRow < 1 || targetRow > total) return;
      const cur = sess.activeRow;
      if (targetRow === cur) return;
      if (options?.setReturn ?? true) sess.setReturn(cur, sess.activeColIdx);
      sess.setActiveRow(targetRow);
      const targetCol = firstIncompleteColIdx(targetRow, vc);
      sess.setActiveCol(targetCol);
      sess.setRecognized('');
      cancelTts();
      // v5.2: bump epoch so in-flight handleFinal's advance() guard aborts
      epochRef.current++;
      awaitingFieldRef.current = null;
      await announceRowDiff(cur, targetRow);
      if (vc[targetCol]) await announceField(vc[targetCol]);
    },
    [announceField, announceRowDiff],
  );

  // ── final result handler ───────────────────────────────────
  const handleFinal = useCallback(async (text: string, _alts: string[], confidence: number) => {
    const awaiting = awaitingFieldRef.current;
    if (!awaiting) return;
    const myEpoch = ++epochRef.current;
    const cmd = detectCommand(text);

    // Commands interrupt TTS immediately
    if (cmd) {
      logger.log({
        type: 'command',
        text,
        parsed: cmd,
        confidence,
        sessionId: sessionIdRef.current,
        row: awaiting.row,
        colId: awaiting.colId,
      });
    }
    if (cmd === 'end') {
      cancelTts();
      await stop(true);
      return;
    }
    if (cmd === 'pause') {
      cancelTts();
      await pause();
      return;
    }
    if (cmd === 'skip') {
      cancelTts();
      await skipRow();
      return;
    }
    if (cmd === 'modify') {
      cancelTts();
      // Prevent nested modify: if already in modify mode, redo current field
      if (awaiting.isModify) {
        await say(`${awaiting.name} 다시 말씀해 주세요.`);
        return;
      }
      const modifyVal = extractModifyValue(text);
      await enterModifyMode(modifyVal || undefined);
      return;
    }
    if (cmd === 'cancel' || cmd === 'redo') {
      cancelTts();
      useSessionStore.getState().setRecognized('');
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    // Input-2: TTS 재생 중에는 값 입력 무시 (명령어는 위에서 이미 처리됨)
    // SpeechController.ttsMuted 플래그를 사용 — onstart/onend 경계로 더 안정적
    if (ctrlRef.current?.isTtsMuted()) {
      return;
    }

    // Log STT event
    lastConfidenceRef.current = confidence;
    logger.log({
      type: 'stt',
      sessionId: sessionIdRef.current,
      row: awaiting.row,
      colId: awaiting.colId,
      colName: awaiting.name,
      text,
      confidence,
      alts: _alts,
    });

    const noisyMode = useSettingsStore.getState().noisyMode;
    const minConfidence = noisyMode ? 0.80 : 0.65;

    // Input-3: 소음 환경 모드 — 1글자 이하 결과 거부
    if (noisyMode && text.replace(/\s/g, '').length <= 1) {
      recorderRef.current?.startClip();
      useSessionStore.getState().setRecognized('');
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    // Low confidence — re-ask
    if (confidence > 0 && confidence < minConfidence) {
      recorderRef.current?.startClip(); // restart clip
      useSessionStore.getState().setRecognized('');
      await say(`잘 못 들었습니다. ${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    // Plain value
    const col = getColById(awaiting.colId);
    const parsed = col ? parseValueForCol(col, text) : null;
    if (parsed === null) {
      recorderRef.current?.startClip(); // restart clip
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    // Fix v5.2 8-1: awaiting.row 사용 — 칩 이동/수정 흐름에서 sess.activeRow와 어긋날 수 있음
    const sess = useSessionStore.getState();
    sess.setRowValue(awaiting.row, awaiting.colId, parsed);
    sess.setRecognized(parsed);

    // Additional-2: 에코 TTS를 stopClip() 보다 먼저 발화하여 사용자 체감 지연 감소
    const echoText = awaiting.isModify
      ? `정정 ${awaiting.name} ${formatForTts(parsed)}`
      : formatForTts(parsed);
    const echoEnqueuedAt = Date.now();
    speak(echoText, {
      interrupt: true,
      rate: getTtsRate(),
      onStart: (d) => {
        logger.log({
          type: 'tts',
          ttsText: echoText,
          startDelayMs: d,
          durationMs: Date.now() - echoEnqueuedAt,
          sessionId: sessionIdRef.current,
          row: awaiting.row,
          extra: 'echo',
        });
      },
    });

    // 클립 저장은 fully fire-and-forget — advance()를 블록하지 않음
    // stopClip()의 MediaRecorder.onstop 대기 (~30-100ms) + IndexedDB put 모두 백그라운드로
    const clipKey = `${sessionIdRef.current}:${awaiting.row}:${awaiting.colId}`;
    const clipAwaitingRow = awaiting.row;
    const clipAwaitingColId = awaiting.colId;
    recorderRef.current?.stopClip().then((clipBlob) => {
      if (!clipBlob || clipBlob.size <= 200) return;
      void saveAudioClip(clipKey, clipBlob).then(() => {
        pendingClipsRef.current[clipAwaitingRow] = {
          ...pendingClipsRef.current[clipAwaitingRow],
          [clipAwaitingColId]: clipKey,
        };
      }).catch(() => { /* ignore IDB errors */ });
    }).catch(() => { /* ignore stopClip errors */ });

    logger.log({
      type: 'value',
      sessionId: sessionIdRef.current,
      row: awaiting.row,
      colId: awaiting.colId,
      colName: awaiting.name,
      text,
      parsed,
      confidence,
    });

    // Guard against race: another handleFinal ran while we were awaiting
    if (epochRef.current !== myEpoch) return;
    await advance();
  }, [advance, enterModifyMode, say, skipRow]);

  // ── start / stop ───────────────────────────────────────────
  const start = useCallback(async (label?: string) => {
    const s = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    if (!s.tableGenerated) return false;
    const vc = s.columns.filter((c) => c.input === 'voice');
    if (vc.length === 0) return false;
    const total = computeTotalRows(s.columns);
    if (total === 0) return false;

    sessionIdRef.current = `sess_${Date.now()}`;
    sessionLabelRef.current = label?.trim() || undefined;
    sess.resetAll();
    sess.setPhase('active');
    sess.setActiveRow(1);
    sess.setActiveCol(0);

    if (!isSpeechSupported()) {
      sess.setLastTts('이 기기는 음성 인식을 지원하지 않습니다.');
      return false;
    }

    warmupTts();
    epochRef.current = 0;
    pendingClipsRef.current = {};
    logger.log({ type: 'session', sessionId: sessionIdRef.current, extra: 'start' });

    // Init audio recorder (best-effort, don't block if permission denied)
    if (!recorderRef.current) recorderRef.current = new AudioRecorder();
    await recorderRef.current.init().catch(() => {});

    await say('음성 입력을 시작합니다.');
    await announceRowDiff(null, 1);

    ctrlRef.current = new SpeechController({
      onFinal: handleFinal,
      onError: () => {},
    });
    setActiveController(ctrlRef.current);
    ctrlRef.current.start();

    await announceField(vc[0]);
    return true;
  }, [announceField, announceRowDiff, handleFinal, say]);

  const stop = useCallback(async (announce = true) => {
    setActiveController(null);
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    cancelTts();
    awaitingFieldRef.current = null;
    recorderRef.current?.dispose();
    recorderRef.current = null;
    logger.log({ type: 'session', sessionId: sessionIdRef.current, extra: 'stop' });
    if (announce) await say('입력을 종료합니다.');
    useSessionStore.getState().setPhase('ready');
    void persistSession();
  }, [persistSession, say]);

  /** Pause STT + TTS without finalizing. UI shows paused state. */
  const pause = useCallback(async () => {
    setActiveController(null);
    ctrlRef.current?.stop();
    ctrlRef.current = null;
    cancelTts();
    useSessionStore.getState().setPhase('paused');
    useSessionStore.getState().setLastTts('일시정지됨. 마이크 다시 탭하면 재개됩니다.');
    await say('일시정지.');
  }, [say]);

  /** Resume from paused: restart STT and re-announce current field. */
  const resume = useCallback(async () => {
    const sess = useSessionStore.getState();
    if (sess.phase !== 'paused') return;
    sess.setPhase('active');
    epochRef.current = 0;
    ctrlRef.current = new SpeechController({
      onFinal: handleFinal,
      onError: () => {},
    });
    setActiveController(ctrlRef.current);
    ctrlRef.current.start();
    // Re-announce current voice column
    const vc = voiceColsList();
    const cur = vc[sess.activeColIdx];
    if (cur) await announceField(cur);
    else await say('재개합니다.');
  }, [announceField, handleFinal, say]);

  // unmount cleanup
  useEffect(() => () => {
    setActiveController(null);
    ctrlRef.current?.stop();
    cancelTts();
    recorderRef.current?.dispose();
  }, []);

  return { start, stop, restartFromCol, jumpToRow, pause, resume, lastConfidenceRef };
}

// ─── helpers ─────────────────────────────────────────────────
function autoNonCyclingValues(columns: Column[], row: number): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.input === 'voice') continue;
    out[c.id] = nestedAutoValue(columns, c, row);
  }
  return out;
}

function parseValueForCol(col: Column, raw: string): string | null {
  if (col.type === 'options' && col.auto.kind === 'options') {
    return matchOption(raw, col.auto.selected.length ? col.auto.selected : col.auto.available);
  }
  if (col.type === 'text') {
    const t = raw.trim();
    return t || null;
  }
  if (col.type === 'date') {
    const m = raw.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
    if (m) {
      const [, y, mo, d] = m;
      return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    return raw.trim() || null;
  }
  // int: strict — reject if the user pronounced a decimal
  if (col.type === 'int') {
    if (/[점쩜.]/.test(raw)) return null;
    return parseKoreanNumber(raw, 0);
  }
  // float
  const decimals = col.decimals ?? 1;
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
