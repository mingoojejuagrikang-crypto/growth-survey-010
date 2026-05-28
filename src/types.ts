export type DataType = 'date' | 'text' | 'int' | 'float' | 'options';

/** Legacy mode kept for migration only. New code uses input + ttsAnnounce. */
export type LegacyInputMode = 'auto' | 'voice' | 'silent';

export type AutoValue =
  | { kind: 'fixed'; value: string }
  | { kind: 'seq'; from: number; to: number }
  | { kind: 'options'; available: string[]; selected: string[] };

export interface Column {
  id: string;
  name: string;
  type: DataType;
  /** 입력 방식: 자동 채움 vs 사용자 음성 입력 vs 사용자 터치 입력 */
  input: 'auto' | 'voice' | 'touch';
  /** TTS로 안내할지 (auto일 땐 자동값 읽기, voice일 땐 항목명 안내) */
  ttsAnnounce: boolean;
  auto: AutoValue;
  /** decimal places when type === 'float' (default 1) */
  decimals?: number;
}

export interface SheetConfig {
  url: string;
  spreadsheetId: string;
  sheetName: string;
  availableSheets: string[];
}

export interface AppSettings {
  googleConnected: boolean;
  userEmail: string | null;
  sheet: SheetConfig | null;
  manualMode: boolean;
  columns: Column[];
  ttsRate: number;
}

/** A single row in the day's pre-built table */
export interface SessionRow {
  index: number;
  /** Column id → value (string for everything; parsed at sync time) */
  values: Record<string, string>;
  /** Has been entered (voice or auto)? */
  complete: boolean;
  /** colId → IDB key for audio clip blob */
  audioClips?: Record<string, string>;
}

export interface Session {
  id: string;
  /** ISO date e.g. 2026-05-13 */
  date: string;
  /** "A구역 정밀측정" 같은 라벨 (선택) */
  label?: string;
  columns: Column[];
  rows: SessionRow[];
  /** rows fully completed */
  completedRows: number;
  /** rows already pushed to Sheets */
  syncedRows: number;
  /** time stamps */
  startedAt: number;
  finishedAt?: number;
}

export type VoiceState = 'IDLE' | 'READY' | 'ANNOUNCE' | 'LISTEN' | 'ECHO' | 'ROW_DONE' | 'DONE';
