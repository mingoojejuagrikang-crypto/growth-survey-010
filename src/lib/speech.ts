/**
 * Web Speech API wrapper:
 *  - SpeechRecognition: continuous, interim, ko-KR
 *  - SpeechSynthesis: queue + interrupt + onend
 *
 * Notes:
 *  - Auto-restart on `onend` while active (browsers cut off after silence)
 *  - When TTS speaks, new STT results during TTS still come in (mic is always on)
 *  - On user request to interrupt TTS, we cancel synthesis queue
 */

import { detectCommand } from './koreanNum';

type SRCtor = new () => SpeechRecognitionLike;

type WindowWithSR = Window & typeof globalThis & {
  SpeechRecognition?: SRCtor;
  webkitSpeechRecognition?: SRCtor;
};

interface SRAlternative {
  transcript: string;
  confidence: number;
}
interface SRResult {
  isFinal: boolean;
  length: number;
  [index: number]: SRAlternative;
}
interface SRResultList {
  length: number;
  [index: number]: SRResult;
}

interface SREvent extends Event {
  resultIndex: number;
  results: SRResultList;
}

export interface SpeechRecognitionLike {
  start: () => void;
  stop: () => void;
  abort: () => void;
  addEventListener: (type: string, cb: (e: Event) => void) => void;
  removeEventListener: (type: string, cb: (e: Event) => void) => void;
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
}

export function isSpeechSupported(): boolean {
  const w = window as WindowWithSR;
  return typeof w.SpeechRecognition !== 'undefined' || typeof w.webkitSpeechRecognition !== 'undefined';
}

export function createRecognition(): SpeechRecognitionLike | null {
  const w = window as WindowWithSR;
  const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
  if (!Ctor) return null;
  const r = new Ctor();
  r.continuous = true;
  r.interimResults = true;
  r.lang = 'ko-KR';
  r.maxAlternatives = 3;
  return r;
}

export interface SpeechCallbacks {
  onFinal: (text: string, alts: string[], confidence: number) => void;
  onInterim?: (text: string) => void;
  onError?: (kind: string) => void;
  onStart?: () => void;
  onEnd?: () => void;
}

/** A long-running recognition controller that auto-restarts. */
export class SpeechController {
  private rec: SpeechRecognitionLike | null = null;
  private cb: SpeechCallbacks;
  private active = false;
  private restartingTimer: number | null = null;
  /** True while TTS is speaking — prevents STT restart to avoid echo feedback */
  private ttsMuted = false;

  constructor(cb: SpeechCallbacks) {
    this.cb = cb;
  }

  /** Called when TTS utterance starts — marks STT muted but keeps recognition alive
   *  so command keywords (수정/정정/스킵/종료) can still be detected during playback.
   *  handleFinal in useVoiceSession ignores non-command results while synth.speaking=true. */
  muteForTts() {
    this.ttsMuted = true;
    // Cancel any pending STT restart from a previous unmuteForTts()
    if (this.restartingTimer !== null) {
      window.clearTimeout(this.restartingTimer);
      this.restartingTimer = null;
    }
  }

  /** Called when TTS utterance ends — STT was never aborted so no restart needed */
  unmuteForTts() {
    this.ttsMuted = false;
  }

  /** True while TTS is actively playing — used by handleFinal to filter value inputs. */
  isTtsMuted(): boolean {
    return this.ttsMuted;
  }

  start() {
    if (this.active) return;
    this.rec = createRecognition();
    if (!this.rec) {
      this.cb.onError?.('unsupported');
      return;
    }
    this.active = true;
    this.bind();
    try {
      this.rec.start();
    } catch (e) {
      // recognition already started — schedule restart
      this.scheduleRestart();
    }
  }

  stop() {
    this.active = false;
    this.ttsMuted = false;
    if (this.restartingTimer !== null) {
      window.clearTimeout(this.restartingTimer);
      this.restartingTimer = null;
    }
    try { this.rec?.abort(); } catch { /* ignore */ }
    this.rec = null;
  }

  private bind() {
    if (!this.rec) return;
    const rec = this.rec;

    const onResult = (raw: Event) => {
      const e = raw as SREvent;
      const r = e.results[e.results.length - 1];
      const final = r.isFinal;
      const text = (r[0]?.transcript || '').trim();
      const confidence = r[0]?.confidence ?? 1;
      const alts: string[] = [];
      for (let i = 0; i < r.length; i++) alts.push(r[i].transcript.trim());
      if (!final && this.ttsMuted && detectCommand(text)) {
        synth?.cancel();
      }
      if (final) this.cb.onFinal(text, alts, confidence);
      else this.cb.onInterim?.(text);
    };
    const onError = (e: Event) => {
      const err = (e as unknown as { error?: string }).error || 'unknown';
      this.cb.onError?.(err);
    };
    const onStart = () => this.cb.onStart?.();
    const onEnd = () => {
      this.cb.onEnd?.();
      if (this.active) this.scheduleRestart();
    };

    rec.addEventListener('result', onResult);
    rec.addEventListener('error', onError);
    rec.addEventListener('start', onStart);
    rec.addEventListener('end', onEnd);
  }

  private scheduleRestart(delay = 100) {
    // v5.2: STT must keep running during TTS so command keywords still work.
    // ttsMuted is no longer a guard here — handleFinal filters non-command results during TTS.
    if (this.restartingTimer !== null) return;
    this.restartingTimer = window.setTimeout(() => {
      this.restartingTimer = null;
      if (!this.active) return;
      try {
        this.rec = createRecognition();
        if (this.rec) {
          this.bind();
          this.rec.start();
        }
      } catch { /* try again next tick */ }
    }, delay);
  }
}

// ─── Active controller reference (for TTS mute integration) ───
let _activeController: SpeechController | null = null;
export function setActiveController(ctrl: SpeechController | null) {
  _activeController = ctrl;
}

// ─── TTS ───────────────────────────────────────────────────────
const synth = typeof window !== 'undefined' ? window.speechSynthesis : null;
let voicesCache: SpeechSynthesisVoice[] = [];

function loadVoices() {
  if (!synth) return;
  voicesCache = synth.getVoices();
}
if (synth) {
  loadVoices();
  synth.onvoiceschanged = loadVoices;
}

let _preferredVoiceName = '';
export function setPreferredVoiceName(name: string) { _preferredVoiceName = name; }

function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const candidates = voicesCache.filter((v) => v.lang?.toLowerCase().startsWith('ko'));
  if (_preferredVoiceName) {
    const preferred = candidates.find((v) => v.name === _preferredVoiceName);
    if (preferred) return preferred;
  }
  return candidates[0] || null;
}

/** Returns all available Korean voices. */
export function getKoreanVoices(): SpeechSynthesisVoice[] {
  return voicesCache.filter((v) => v.lang?.toLowerCase().startsWith('ko'));
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Cancel any currently-speaking utterance before starting */
  interrupt?: boolean;
  /** Called when the TTS engine actually starts playback. Receives delay in ms from enqueue → start. */
  onStart?: (startDelayMs: number) => void;
}

/** Speak text. Returns a Promise that resolves when finished. */
export async function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!synth) return;
  if (opts.interrupt) {
    synth.cancel();
    // iOS Safari: cancel() 직후 speak()하면 onend 미발생 버그 완화
    await new Promise((r) => setTimeout(r, 50));
  }
  const enqueuedAt = Date.now();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickKoreanVoice();
    if (v) try { u.voice = v; } catch { /* ignore — plain-object voice in test/mock env */ }
    u.lang = 'ko-KR';
    u.rate = opts.rate ?? 1.05;
    u.pitch = opts.pitch ?? 1;
    u.volume = opts.volume ?? 1;

    let settled = false;
    let watchdog: ReturnType<typeof setTimeout> | null = null;
    const done = () => {
      if (settled) return;
      settled = true;
      if (watchdog) { clearTimeout(watchdog); watchdog = null; }
      _activeController?.unmuteForTts();
      resolve();
    };

    u.onstart = () => {
      if (settled) return;
      opts.onStart?.(Date.now() - enqueuedAt);
    };
    u.onend = done;
    u.onerror = done;

    // iOS Safari 안전장치: onend/onerror 미발생 시 10초 후 강제 resolve
    watchdog = setTimeout(done, 10_000);

    // synth.speak → onstart 사이 50~500ms 갭 동안 STT 값이 필터링 안 되는 버그 수정:
    // muteForTts를 onstart가 아닌 synth.speak 직전에 호출
    _activeController?.muteForTts();
    synth.speak(u);
  });
}

export function cancelTts() {
  if (synth) synth.cancel();
}

/** Pre-warm the TTS engine to reduce first-utterance delay.
 *  Uses a near-silent '0' utterance — stronger iOS cold-start warm than an empty string. */
export function warmupTts() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance('0');
  const v = pickKoreanVoice();
  if (v) try { u.voice = v; } catch { /* ignore — plain-object voice in test/mock env */ }
  u.lang = 'ko-KR';
  u.volume = 0.01;
  u.rate = 1.5;
  synth.speak(u);
}

/**
 * Format a number for natural TTS reading: '35.1' → '삼십오 점 일' is too robotic;
 * the native synthesis voice handles arabic digits well, so just pass-through.
 */
export function formatForTts(value: string): string {
  return value;
}
