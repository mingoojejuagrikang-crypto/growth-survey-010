/** In-memory event logger for voice session diagnostics. */

export interface LogEntry {
  ts: number;
  type: 'stt' | 'tts' | 'command' | 'session' | 'value' | 'error';
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

  log(entry: Omit<LogEntry, 'ts'>): void {
    entries.push({ ts: Date.now(), ...entry });
    // Keep max 2000 entries
    if (entries.length > 2000) entries.splice(0, entries.length - 2000);
  },

  getAll(): LogEntry[] {
    return [...entries];
  },

  clear(): void {
    entries.length = 0;
  },
};
