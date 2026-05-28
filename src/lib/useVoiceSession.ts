import { useCallback, useEffect, useRef } from 'react';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { useDataStore } from '../stores/dataStore';
import { parseKoreanNumber, detectCommand, extractModifyValue } from './koreanNum';
import { SpeechController, speak, cancelTts, isSpeechSupported, formatForTts, warmupTts, setActiveController, setPreferredVoiceName } from './speech';
import { computeTotalRows, buildCyclingValues, nestedAutoValue } from './autoValue';
import type { Column, Session, SessionRow } from '../types';
import { saveSession, saveAudioClip, deleteAudioClip } from './db';
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
  // Codex 재검증 MEDIUM: in-flight clip save promises; stop()/pause()가 끝나기 전 flush
  const pendingClipSavesRef = useRef<Set<Promise<unknown>>>(new Set());
  // Snapshot of a persisted row being cascade-corrected; included in persistSession if stop()
  // fires before re-completion so original measurements are not lost.
  const correctionBackupRef = useRef<SessionRow | null>(null);
  // Ref to resume() — breaks the circular dependency between handleFinal and resume.
  const resumeRef = useRef<() => Promise<void>>(async () => {});

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
    // Check backup BEFORE early return: if cascade correction is in progress and the correcting row
    // was the only completed row, we still need to persist the backup snapshot.
    const backup = correctionBackupRef.current;
    if (completed.length === 0 && !backup) return;
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
    // If stop() fires while a cascade correction is in progress (row not yet re-completed),
    // include the backup snapshot so original measurements survive the persist.
    if (backup && !completed.includes(backup.index)) {
      rows.push({ ...backup });
      rows.sort((a, b) => a.index - b.index);
    }
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

  /** Announce row completion: only auto+ttsAnnounce columns that differ from the previous row. */
  const announceRowComplete = useCallback(
    async (row: number) => {
      const cols = useSettingsStore.getState().columns;
      const curAuto = buildCyclingValues(cols, row);
      const prevAuto = row > 1 ? buildCyclingValues(cols, row - 1) : null;
      const parts: string[] = [];
      for (const c of cols) {
        if (c.input !== 'auto' || !c.ttsAnnounce) continue;
        const cv = curAuto[c.id] ?? '';
        if (!cv) continue;
        if (prevAuto === null || (prevAuto[c.id] ?? '') !== cv) {
          parts.push(`${c.name} ${cv}`);
        }
      }
      if (parts.length) await say(parts.join(', ') + ' 완료.', false);
      else await say('완료.', false);
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
    const startEpoch = epochRef.current;
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
    if (correctionBackupRef.current?.index === row) correctionBackupRef.current = null;
    sess.markRowComplete(row);
    sess.setPhase('complete');
    void persistSession();
    awaitingFieldRef.current = null;
    await announceRowComplete(row);
    if (epochRef.current !== startEpoch) return;

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
      awaitingFieldRef.current = null;
      await announceRowDiff(row, ret);
      if (epochRef.current !== startEpoch) return;
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
    awaitingFieldRef.current = null;
    await announceRowDiff(row, next);
    if (epochRef.current !== startEpoch) return;
    if (vc[targetCol]) await announceField(vc[targetCol]);
  }, [announceField, announceRowComplete, announceRowDiff, persistSession, say]);

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
        // Codex 5차 MEDIUM: Direct modify는 새 클립을 녹음하지 않으므로,
        // 이전 (잘못 인식된) 클립을 제거하여 corrected value에 stale audio가 매칭되지 않도록 함.
        // (1) pendingClipsRef에서 제거
        const pendingMap = pendingClipsRef.current[targetRow];
        if (pendingMap && pendingMap[target.id]) {
          const stalePendingKey = pendingMap[target.id];
          delete pendingMap[target.id];
          void deleteAudioClip(stalePendingKey).catch(() => {});
        }
        // (2) 이미 persistSession으로 dataStore에 들어간 경우 — 해당 row의 audioClips 정리
        const existing = useDataStore.getState().sessions.find((s) => s.id === sessionIdRef.current);
        const existingRow = existing?.rows.find((r) => r.index === targetRow);
        if (existing && existingRow?.audioClips?.[target.id]) {
          const staleExistingKey = existingRow.audioClips[target.id];
          void deleteAudioClip(staleExistingKey).catch(() => {});
          const { [target.id]: _removed, ...restClips } = existingRow.audioClips;
          const updatedRow = {
            ...existingRow,
            values: { ...existingRow.values, [target.id]: parsed },
            audioClips: Object.keys(restClips).length > 0 ? restClips : undefined,
          };
          const updatedSession = {
            ...existing,
            rows: existing.rows.map((r) => (r.index === targetRow ? updatedRow : r)),
          };
          useDataStore.getState().upsertSession(updatedSession);
          void saveSession(updatedSession).catch(() => {});
        } else if (targetRow < curRow) {
          // If we modified an earlier row, make sure it's still complete
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

    // Snapshot the existing row before clearing in-memory. persistSession() includes this backup
    // if stop() fires before re-completion. If persistSession fire-and-forget hasn't flushed yet
    // (row in sessionStore.completedRows but not yet in useDataStore), build from live store.
    {
      const existingForBackup = useDataStore.getState().sessions.find((s) => s.id === sessionIdRef.current);
      const persistedRow = existingForBackup?.rows.find((r) => r.index === targetRow);
      if (persistedRow) {
        correctionBackupRef.current = persistedRow;
      } else if (sess.isRowComplete(targetRow)) {
        const bSettings = useSettingsStore.getState();
        const bAuto = buildCyclingValues(bSettings.columns, targetRow);
        const bFixed = autoNonCyclingValues(bSettings.columns, targetRow);
        correctionBackupRef.current = {
          index: targetRow,
          values: { ...bFixed, ...bAuto, ...sess.getRowValues(targetRow) },
          complete: true,
        };
      } else {
        correctionBackupRef.current = null;
      }
    }

    // Cascade clear in-memory only: target col through end of row (so user re-records all remaining cols).
    // Persisted IDB/dataStore state is left intact until the row is successfully re-completed and
    // persistSession() overwrites it — this ensures old measurements survive a crash/reload during correction.
    for (let i = targetIdx; i < vc.length; i++) {
      sess.setRowValue(targetRow, vc[i].id, '');
      // Only delete clips that are still pending (not yet saved to IDB).
      // Already-persisted clips stay until persistSession() replaces them on re-completion.
      const pendingMap = pendingClipsRef.current[targetRow];
      if (pendingMap?.[vc[i].id]) {
        const staleKey = pendingMap[vc[i].id];
        delete pendingMap[vc[i].id];
        void deleteAudioClip(staleKey).catch(() => {});
      }
    }
    sess.markRowIncomplete(targetRow);
    // No returnRow — advance() naturally proceeds from targetIdx forward
    sess.setActiveRow(targetRow);
    sess.setActiveCol(targetIdx);
    sess.setRecognized('');
    await announceField(target, { isModify: true });
  }, [announceField, persistSession, say]);

  // ── skip ───────────────────────────────────────────────────
  const skipRow = useCallback(async () => {
    const startEpoch = epochRef.current;
    const settings = useSettingsStore.getState();
    const sess = useSessionStore.getState();
    const vc = voiceColsList();
    const row = sess.activeRow;
    const total = computeTotalRows(settings.columns);
    for (const c of vc) {
      sess.setRowValue(row, c.id, '');
    }
    sess.markRowComplete(row);
    void persistSession();
    awaitingFieldRef.current = null;
    await say('건너뜁니다.');
    if (epochRef.current !== startEpoch) return;
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
    awaitingFieldRef.current = null;
    await announceRowDiff(row, next);
    if (epochRef.current !== startEpoch) return;
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
  const handleFinal = useCallback(async (text: string, alts: string[], confidence: number) => {
    const awaiting = awaitingFieldRef.current;
    if (!awaiting) return;
    const cmd = detectCommand(text);

    // While paused, only handle the 'resume' command; ignore everything else.
    if (useSessionStore.getState().phase === 'paused') {
      if (cmd === 'resume') {
        epochRef.current++;
        cancelTts();
        await resumeRef.current();
      }
      return;
    }

    // Commands interrupt TTS immediately — bump epoch to invalidate in-flight advance/skip
    if (cmd) {
      epochRef.current++;
      logger.log({
        type: 'command',
        text,
        parsed: cmd,
        confidence,
        sessionId: sessionIdRef.current,
        row: awaiting.row,
        colId: awaiting.colId,
        extra: ctrlRef.current?.isTtsMuted() ? 'tts_was_speaking' : 'tts_silent',
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
    if (cmd === 'resume') {
      cancelTts();
      await resumeRef.current();
      return;
    }
    if (cmd === 'skip') {
      cancelTts();
      await skipRow();
      return;
    }
    if (cmd === 'modify') {
      cancelTts();
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
    if (ctrlRef.current?.isTtsMuted()) {
      logger.log({ type: 'stt_blocked_tts_muted', text, sessionId: sessionIdRef.current, row: awaiting.row, colId: awaiting.colId });
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
      alts,
    });

    // Item 12: 컬럼명 완전 일치 STT 거부 — 숫자/날짜 컬럼에만 적용 (text/options 컬럼은 컬럼명이 유효한 값일 수 있음)
    const allColumns = useSettingsStore.getState().columns;
    const currentCol = allColumns.find((c) => c.id === awaiting.colId);
    if (currentCol && currentCol.type !== 'text' && currentCol.type !== 'options') {
      const colNames = allColumns.map((c) => c.name.trim());
      if (colNames.includes(text.trim())) {
        logger.log({ type: 'stt_rejected_col_name', text, sessionId: sessionIdRef.current, row: awaiting.row, colId: awaiting.colId });
        useSessionStore.getState().setRecognized('');
        await say(`${awaiting.name} 다시 말씀해 주세요.`);
        return;
      }
      const KNOWN_NOISE = /^(변경|성경|광경|구정|혜정|당장|경정)$/;
      if (KNOWN_NOISE.test(text.trim())) {
        logger.log({ type: 'stt_rejected_col_name', text, sessionId: sessionIdRef.current, row: awaiting.row, colId: awaiting.colId, extra: 'known_noise' });
        recorderRef.current?.startClip();
        useSessionStore.getState().setRecognized('');
        await say(`${awaiting.name} 다시 말씀해 주세요.`);
        return;
      }
    }

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

    // Plain value — with alts fallback on parse failure (item 11)
    const col = getColById(awaiting.colId);
    let parsed = col ? parseValueForCol(col, text) : null;
    if (parsed === null && alts.length > 1) {
      for (let ai = 1; ai < Math.min(alts.length, 3); ai++) {
        const alt = alts[ai];
        if (!alt || alt === text) continue;
        const altParsed = col ? parseValueForCol(col, alt) : null;
        if (altParsed !== null) {
          parsed = altParsed;
          logger.log({ type: 'stt_alt_used', altIdx: ai, text: alt, originalText: text, sessionId: sessionIdRef.current, row: awaiting.row, colId: awaiting.colId });
          break;
        }
      }
    }
    if (parsed === null) {
      logger.log({ type: 'stt_parse_failed', text, altsCount: alts.length, sessionId: sessionIdRef.current, row: awaiting.row, colId: awaiting.colId });
      recorderRef.current?.startClip(); // restart clip
      await say(`${awaiting.name} 다시 말씀해 주세요.`);
      return;
    }

    const myEpoch = ++epochRef.current;
    const sess = useSessionStore.getState();
    sess.setRowValue(awaiting.row, awaiting.colId, parsed);
    sess.setRecognized(parsed);
    awaitingFieldRef.current = null;

    // v0.10 클립 누락 수정: stopClip을 echo TTS 이전에 시작 (병렬 실행)
    // 이전 버그: await speak(echo) 동안 마이크 stream이 idle → 다음 startClip이 호출되면 이전 슬롯 손실
    const clipKey = `${sessionIdRef.current}:${awaiting.row}:${awaiting.colId}`;
    const clipAwaitingRow = awaiting.row;
    const clipAwaitingColId = awaiting.colId;
    pendingClipsRef.current[clipAwaitingRow] = {
      ...pendingClipsRef.current[clipAwaitingRow],
      [clipAwaitingColId]: clipKey,
    };
    const clipStopPromise = recorderRef.current?.stopClip() ?? Promise.resolve(null);
    const savePromise = (async () => {
      try {
        const clipBlob = await clipStopPromise;
        if (!clipBlob) {
          logger.log({ type: 'error', extra: 'clip_empty', sessionId: sessionIdRef.current, row: clipAwaitingRow, colId: clipAwaitingColId });
          const m = pendingClipsRef.current[clipAwaitingRow];
          if (m && m[clipAwaitingColId] === clipKey) delete m[clipAwaitingColId];
          return;
        }
        if (clipBlob.size <= 200) {
          logger.log({ type: 'error', extra: `clip_too_small:${clipBlob.size}`, sessionId: sessionIdRef.current, row: clipAwaitingRow, colId: clipAwaitingColId });
          const m = pendingClipsRef.current[clipAwaitingRow];
          if (m && m[clipAwaitingColId] === clipKey) delete m[clipAwaitingColId];
          return;
        }
        // v0.10.1 Codex MEDIUM: restart/modify/jump가 epoch을 바꿨다면 stale 시도의 클립이므로 폐기.
        // saveAudioClip은 put이므로 가드 없으면 나중 시도의 올바른 클립을 덮어쓸 수 있음.
        if (epochRef.current !== myEpoch) {
          logger.log({ type: 'error', extra: 'clip_stale_epoch', sessionId: sessionIdRef.current, row: clipAwaitingRow, colId: clipAwaitingColId });
          const m = pendingClipsRef.current[clipAwaitingRow];
          if (m && m[clipAwaitingColId] === clipKey) delete m[clipAwaitingColId];
          return;
        }
        await saveAudioClip(clipKey, clipBlob);
      } catch {
        const m = pendingClipsRef.current[clipAwaitingRow];
        if (m && m[clipAwaitingColId] === clipKey) delete m[clipAwaitingColId];
      }
    })();
    pendingClipSavesRef.current.add(savePromise);
    void savePromise.finally(() => pendingClipSavesRef.current.delete(savePromise));

    const echoText = awaiting.isModify
      ? `정정 ${awaiting.name} ${formatForTts(parsed)}`
      : formatForTts(parsed);
    const echoEnqueuedAt = Date.now();
    await speak(echoText, {
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
    setPreferredVoiceName(s.preferredVoiceName);
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
    correctionBackupRef.current = null;
    logger.log({ type: 'session', sessionId: sessionIdRef.current, extra: 'start' });

    // Init audio recorder fire-and-forget — mic permission is independent of STT startup.
    // Awaiting getUserMedia can block indefinitely in headless/denied-permission environments.
    if (!recorderRef.current) recorderRef.current = new AudioRecorder();
    void recorderRef.current.init().catch(() => {});

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
    logger.log({ type: 'session', sessionId: sessionIdRef.current, extra: 'stop' });
    if (announce) await say('입력을 종료합니다.');
    useSessionStore.getState().setPhase('ready');
    // Codex 3차 HIGH: 클립 저장을 dispose보다 먼저 flush.
    // dispose는 in-flight stopClip의 resolveStop을 null로 해소하지만(zombie 방지),
    // 가능하면 자연 onstop으로 실제 blob을 저장하는 것이 우선.
    if (pendingClipSavesRef.current.size > 0) {
      // 5초 안전 타임아웃: dispose가 즉시 해소하므로 일반적으로 즉시 끝나지만 race 대비.
      await Promise.race([
        Promise.allSettled(Array.from(pendingClipSavesRef.current)),
        new Promise<void>((resolve) => setTimeout(resolve, 5000)),
      ]);
    }
    recorderRef.current?.dispose();
    recorderRef.current = null;
    // v0.10: await로 변경 — audioClips 키가 IDB session에 확실히 저장된 후 종료
    await persistSession();
  }, [persistSession, say]);

  /** Pause STT value processing without stopping the controller.
   *  The controller stays active so the user can say '재시작' to resume.
   *  Recorder is disposed to prevent clip accumulation while paused. */
  const pause = useCallback(async () => {
    cancelTts();
    recorderRef.current?.dispose();
    recorderRef.current = null;
    useSessionStore.getState().setPhase('paused');
    useSessionStore.getState().setLastTts('일시정지됨. 마이크 다시 탭하면 재개됩니다.');
    await say('일시정지.');
  }, [say]);

  /** Resume from paused: re-announce current field. Controller is kept alive during pause. */
  const resume = useCallback(async () => {
    const sess = useSessionStore.getState();
    if (sess.phase !== 'paused') return;
    sess.setPhase('active');
    epochRef.current = 0;
    // Controller stays alive during pause (pause() no longer stops it).
    // Recreate only if it was somehow stopped (e.g., programmatic stop from outside).
    if (!ctrlRef.current) {
      ctrlRef.current = new SpeechController({
        onFinal: handleFinal,
        onError: () => {},
      });
      setActiveController(ctrlRef.current);
      ctrlRef.current.start();
    }
    // Recorder was disposed during pause — recreate for the resumed session.
    if (!recorderRef.current) {
      recorderRef.current = new AudioRecorder();
      await recorderRef.current.init().catch(() => {});
    }
    const vc = voiceColsList();
    const cur = vc[sess.activeColIdx];
    if (cur) await announceField(cur);
    else await say('재개합니다.');
  }, [announceField, handleFinal, say]);

  // Keep resumeRef in sync so handleFinal can call resume without a circular dep.
  useEffect(() => { resumeRef.current = resume; }, [resume]);

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
