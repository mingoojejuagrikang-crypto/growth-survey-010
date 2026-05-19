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

  /** Called when TTS utterance starts — aborts active STT to prevent echo */
  muteForTts() {
    this.ttsMuted = true;
    // Cancel any pending STT restart from a previous unmuteForTts()
    if (this.restartingTimer !== null) {
      window.clearTimeout(this.restartingTimer);
      this.restartingTimer = null;
    }
    try { this.rec?.abort(); } catch { /* ignore */ }
  }

  /** Called when TTS utterance ends — resumes STT after short delay to clear echo */
  unmuteForTts() {
    this.ttsMuted = false;
    this.scheduleRestart(150);
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
    if (this.ttsMuted) return;  // TTS 재생 중에는 재시작 안 함
    if (this.restartingTimer !== null) return;
    this.restartingTimer = window.setTimeout(() => {
      this.restartingTimer = null;
      if (!this.active || this.ttsMuted) return;
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

function pickKoreanVoice(): SpeechSynthesisVoice | null {
  const candidates = voicesCache.filter((v) => v.lang?.toLowerCase().startsWith('ko'));
  return candidates[0] || null;
}

export interface SpeakOptions {
  rate?: number;
  pitch?: number;
  volume?: number;
  /** Cancel any currently-speaking utterance before starting */
  interrupt?: boolean;
}

/** Speak text. Returns a Promise that resolves when finished. */
export function speak(text: string, opts: SpeakOptions = {}): Promise<void> {
  if (!synth) return Promise.resolve();
  if (opts.interrupt) synth.cancel();
  return new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text);
    const v = pickKoreanVoice();
    if (v) u.voice = v;
    u.lang = 'ko-KR';
    u.rate = opts.rate ?? 1.05;
    u.pitch = opts.pitch ?? 1;
    u.volume = opts.volume ?? 1;
    u.onstart = () => { _activeController?.muteForTts(); };
    u.onend = () => { _activeController?.unmuteForTts(); resolve(); };
    u.onerror = () => { _activeController?.unmuteForTts(); resolve(); };
    synth.speak(u);
  });
}

export function cancelTts() {
  if (synth) synth.cancel();
}

/** Pre-warm the TTS engine to reduce first-utterance delay. */
export function warmupTts() {
  if (!synth) return;
  const u = new SpeechSynthesisUtterance('');
  u.volume = 0;
  synth.speak(u);
  synth.cancel();
}

/**
 * Format a number for natural TTS reading: '35.1' → '삼십오 점 일' is too robotic;
 * the native synthesis voice handles arabic digits well, so just pass-through.
 */
export function formatForTts(value: string): string {
  return value;
}
