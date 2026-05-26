/** Event logger for voice session diagnostics.
 *  In-memory ring buffer for fast access + IDB persistence (v5.2 Codex 4차 MEDIUM)
 *  so reload-before-sync flows still have diagnostic events available for the auto-uploaded ZIP.
 */
import { appendLogEvent } from './db';

export interface LogEntry {
  ts: number;
  type: 'stt' | 'tts' | 'command' | 'session' | 'value' | 'error'
    | 'stt_blocked_tts_muted' | 'stt_rejected_col_name' | 'stt_alt_used' | 'stt_parse_failed';
  sessionId?: string;
  row?: number;
  colId?: string;
  colName?: string;
  text?: string;
  confidence?: number;
  alts?: string[];
  ttsText?: string;
  parsed?: string;
  command?: string;
  durationMs?: number;
  /** TTS engine cold-start latency (enqueue → audio onstart). v5.2 Additional-2. */
  startDelayMs?: number | null;
  extra?: string;
  altIdx?: number;
  originalText?: string;
  altsCount?: number;
}

export interface DeviceInfo {
  userAgent: string;
  platform: string;
  language: string;
  screenW: number;
  screenH: number;
  deviceMemory?: number;
  hardwareConcurrency?: number;
  appVersion: string;
  audioInputDevices?: { deviceId: string; label: string; kind: string }[];
}

const entries: LogEntry[] = [];

export const logger = {
  device(): DeviceInfo {
    const nav = navigator as Navigator & { deviceMemory?: number };
    return {
      userAgent: nav.userAgent,
      platform: nav.platform,
      language: nav.language,
      screenW: screen.width,
      screenH: screen.height,
      deviceMemory: nav.deviceMemory,
      hardwareConcurrency: nav.hardwareConcurrency,
      appVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '?',
    };
  },

  async deviceAsync(): Promise<DeviceInfo> {
    const base = this.device();
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((d) => d.kind === 'audioinput');
      base.audioInputDevices = audioInputs.map((d) => ({
        deviceId: d.deviceId, label: d.label, kind: d.kind,
      }));
    } catch { /* permission denied or unavailable */ }
    return base;
  },

  log(entry: Omit<LogEntry, 'ts'>): void {
    const full = { ts: Date.now(), ...entry };
    entries.push(full);
    // Keep max 2000 entries in memory
    if (entries.length > 2000) entries.splice(0, entries.length - 2000);
    // Fire-and-forget IDB persistence (failures fall back to memory-only behavior)
    void appendLogEvent(full as unknown as Parameters<typeof appendLogEvent>[0]);
  },

  getAll(): LogEntry[] {
    return [...entries];
  },

  clear(): void {
    entries.length = 0;
  },
};
