export type DataType = 'date' | 'text' | 'int' | 'float';
export type InputMode = 'auto' | 'voice' | 'silent';

export type AutoValue =
  | { kind: 'fixed'; value: string }
  | { kind: 'seq'; from: number; to: number };

export interface Column {
  id: string;
  name: string;
  type: DataType;
  mode: InputMode;
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
}

/** A single row in the day's pre-built table */
export interface SessionRow {
  index: number;
  /** Column id → value (string for everything; parsed at sync time) */
  values: Record<string, string>;
  /** Has been entered (voice or auto)? */
  complete: boolean;
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
