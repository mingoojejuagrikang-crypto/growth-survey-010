/**
 * MediaRecorder wrapper for per-field voice clip recording.
 * Records from the microphone independently of SpeechRecognition.
 *
 * Codex 4차 HIGH: 인스턴스별 상태 격리.
 * 각 녹음 슬롯이 자체 chunks/recorder/resolveStop을 소유하므로,
 * 이전 recorder의 큐잉된 ondataavailable/onstop 콜백이 새 슬롯 상태를 오염시키지 않음.
 */

import { logger } from './logger';

interface ClipSlot {
  recorder: MediaRecorder;
  chunks: Blob[];
  mimeType: string;
  resolveStop: ((b: Blob | null) => void) | null;
  finalized: boolean;
  stopTimer: ReturnType<typeof setTimeout> | null;
}

/** onstop이 끝내 발화하지 않는 환경(iOS Safari 마이크 점유 등)에서 hang을 막는 안전장치. */
const STOP_TIMEOUT_MS = 2000;

export class AudioRecorder {
  private stream: MediaStream | null = null;
  /** Active (recording) slot — only this one can be stopped via stopClip(). */
  private active: ClipSlot | null = null;

  async init(): Promise<boolean> {
    if (this.stream) return true;
    try {
      // 소음 환경(비닐하우스 등) 대응: 브라우저 내장 DSP 활성화 — 추가 지연 없음(1초 제약 무관).
      // echoCancellation은 TTS 에코가 마이크로 되먹임되는 것도 줄여줌.
      // autoGainControl은 소음 환경(빗소리 등)에서 무음 구간 게인을 키워 노이즈를 증폭할 수 있어 끔.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          noiseSuppression: true,
          echoCancellation: true,
          autoGainControl: false,
        },
        video: false,
      });
      return true;
    } catch {
      return false;
    }
  }

  startClip(): void {
    if (!this.stream) {
      logger.log({ type: 'clip', extra: 'clip_no_stream' });
      return;
    }

    // Detach the previous active slot first — its callbacks will continue to read
    // ONLY its own captured `slot` reference, so they cannot pollute the new slot.
    const prev = this.active;
    if (prev) {
      // If prev still has a pending stopClip waiter, resolve it now with whatever it captured.
      // The actual onstop may still fire later, but it will be a no-op (finalized guard).
      if (!prev.finalized && prev.recorder.state !== 'inactive') {
        try { prev.recorder.stop(); } catch { /* ignore */ }
      }
      if (!prev.finalized && prev.resolveStop) {
        prev.finalized = true;
        if (prev.stopTimer) { clearTimeout(prev.stopTimer); prev.stopTimer = null; }
        const blob = prev.chunks.length > 0
          ? new Blob(prev.chunks, { type: prev.mimeType || 'audio/webm' })
          : null;
        prev.resolveStop(blob);
        prev.resolveStop = null;
      }
    }

    try {
      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : MediaRecorder.isTypeSupported('audio/mp4')
        ? 'audio/mp4'
        : '';
      const recorder = mimeType
        ? new MediaRecorder(this.stream, { mimeType })
        : new MediaRecorder(this.stream);

      const slot: ClipSlot = {
        recorder,
        chunks: [],
        mimeType: recorder.mimeType || mimeType,
        resolveStop: null,
        finalized: false,
        stopTimer: null,
      };

      // Callbacks close over `slot` exclusively — no `this.*` access, so a stale recorder
      // can never observe or corrupt the next slot's state.
      recorder.ondataavailable = (e) => {
        if (slot.finalized) return;
        if (e.data && e.data.size > 0) slot.chunks.push(e.data);
      };
      recorder.onstop = () => {
        if (slot.finalized) return;
        slot.finalized = true;
        if (slot.stopTimer) { clearTimeout(slot.stopTimer); slot.stopTimer = null; }
        const blob = slot.chunks.length > 0
          ? new Blob(slot.chunks, { type: slot.mimeType || 'audio/webm' })
          : null;
        slot.resolveStop?.(blob);
        slot.resolveStop = null;
      };

      this.active = slot;
      // timeslice 250ms: 짧은(1초 미만) 발화도 stop/timeout 전에 chunk를 확보하도록 자주 flush.
      // iOS Safari에서 stop 시 final dataavailable이 지연돼 timeout이 먼저 닫혀도 누락을 줄임.
      recorder.start(250);
      logger.log({ type: 'clip', extra: `clip_started:${slot.mimeType || 'default'}` });
    } catch (e) {
      this.active = null;
      logger.log({ type: 'error', extra: `clip_start_failed:${String((e as Error)?.message ?? e)}` });
    }
  }

  stopClip(): Promise<Blob | null> {
    const slot = this.active;
    return new Promise((resolve) => {
      if (!slot || slot.finalized) {
        resolve(null);
        return;
      }
      if (slot.recorder.state === 'inactive') {
        // Already stopped synchronously by startClip(); we should have resolved there but be defensive.
        slot.finalized = true;
        const blob = slot.chunks.length > 0
          ? new Blob(slot.chunks, { type: slot.mimeType || 'audio/webm' })
          : null;
        resolve(blob);
        return;
      }
      slot.resolveStop = resolve;
      // onstop이 끝내 발화하지 않는 환경(iOS 마이크 점유)에서 hang 방지:
      // timeout 시 지금까지 수집된 chunks로 blob을 만들어 resolve.
      slot.stopTimer = setTimeout(() => {
        if (slot.finalized) return;
        slot.finalized = true;
        slot.stopTimer = null;
        const blob = slot.chunks.length > 0
          ? new Blob(slot.chunks, { type: slot.mimeType || 'audio/webm' })
          : null;
        logger.log({ type: 'error', extra: `clip_stop_timeout:${slot.chunks.length}` });
        slot.resolveStop?.(blob);
        slot.resolveStop = null;
      }, STOP_TIMEOUT_MS);
      try { slot.recorder.stop(); } catch { /* ignore */ }
    });
  }

  dispose(): void {
    // Resolve any pending stopClip first so awaiters don't hang.
    const slot = this.active;
    this.active = null;
    if (slot && !slot.finalized) {
      slot.finalized = true;
      if (slot.stopTimer) { clearTimeout(slot.stopTimer); slot.stopTimer = null; }
      if (slot.recorder.state !== 'inactive') {
        try { slot.recorder.stop(); } catch { /* ignore */ }
      }
      if (slot.resolveStop) {
        slot.resolveStop(null);
        slot.resolveStop = null;
      }
    }
    if (this.stream) {
      for (const track of this.stream.getTracks()) track.stop();
      this.stream = null;
    }
  }
}
