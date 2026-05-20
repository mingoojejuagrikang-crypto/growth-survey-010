import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Column, SheetConfig, LegacyInputMode } from '../types';

interface SettingsState {
  googleConnected: boolean;
  userEmail: string | null;
  sheet: SheetConfig | null;
  sheetUrl: string;
  sheetTab: string;
  availableSheets: string[];
  manualMode: boolean;
  columns: Column[];
  tableGenerated: boolean;
  totalRows: number;
  /** TTS playback rate (0.5 ~ 2.0) */
  ttsRate: number;
  /** Which auto column's value is used as the session label suffix. null = auto-pick. */
  sessionLabelColId: string | null;
  /** Pre-computed session label captured at table generation time. */
  sessionAutoLabel: string | null;
  /** Noisy environment mode — raises STT confidence threshold + rejects single-char results. */
  noisyMode: boolean;

  set: (partial: Partial<Omit<SettingsState, 'set' | 'updateColumn' | 'addColumn' | 'removeColumn' | 'reorderColumns'>>) => void;
  updateColumn: (id: string, next: Column) => void;
  addColumn: () => void;
  removeColumn: (id: string) => void;
  reorderColumns: (fromIdx: number, toIdx: number) => void;
}

const MOCK_COLUMNS: Column[] = [
  { id: 'c1',  name: '조사일자', type: 'date',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '오늘' } },
  { id: 'c2',  name: '기준일자', type: 'date',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '2026-05-13' } },
  { id: 'c3',  name: '농가명',   type: 'text',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '이원창' } },
  { id: 'c4',  name: '라벨',     type: 'text',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: 'A' } },
  { id: 'c5',  name: '처리',     type: 'text',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '시험' } },
  { id: 'c6',  name: '조사나무', type: 'int',   input: 'auto', ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 10 } },
  { id: 'c7',  name: '조사과실', type: 'int',   input: 'auto', ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 5 } },
  { id: 'c8',  name: '횡경',     type: 'float', input: 'voice', ttsAnnounce: true, auto: { kind: 'fixed', value: '' }, decimals: 1 },
  { id: 'c9',  name: '종경',     type: 'float', input: 'voice', ttsAnnounce: true, auto: { kind: 'fixed', value: '' }, decimals: 1 },
  { id: 'c10', name: '비고',     type: 'text',  input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '' } },
];

/** Migrate legacy mode-based columns to new input/ttsAnnounce shape. */
function migrateColumn(c: unknown): Column {
  const x = c as Partial<Column> & { mode?: LegacyInputMode };
  if (x.input !== undefined && x.ttsAnnounce !== undefined) {
    return x as Column;
  }
  let input: 'auto' | 'voice' = 'auto';
  let ttsAnnounce = true;
  switch (x.mode) {
    case 'voice':  input = 'voice'; ttsAnnounce = true;  break;
    case 'silent': input = 'auto';  ttsAnnounce = false; break;
    case 'auto':
    default:       input = 'auto';  ttsAnnounce = true;  break;
  }
  return {
    id: x.id || `c${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    name: x.name || '새 항목',
    type: x.type || 'text',
    input,
    ttsAnnounce,
    auto: x.auto || { kind: 'fixed', value: '' },
    decimals: x.decimals,
  };
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      googleConnected: false,
      userEmail: null,
      sheet: null,
      sheetUrl: '',
      sheetTab: '',
      availableSheets: [],
      manualMode: false,
      columns: MOCK_COLUMNS,
      tableGenerated: false,
      totalRows: 50,
      ttsRate: 1.05,
      sessionLabelColId: null,
      sessionAutoLabel: null,
      noisyMode: false,

      set: (partial) => set(partial),
      updateColumn: (id, next) =>
        set((state) => ({
          columns: state.columns.map((c) => (c.id === id ? next : c)),
        })),
      addColumn: () =>
        set((state) => ({
          columns: [
            ...state.columns,
            {
              id: 'c' + Date.now(),
              name: '새 항목',
              type: 'text',
              input: 'auto',
              ttsAnnounce: false,
              auto: { kind: 'fixed', value: '' },
            },
          ],
        })),
      removeColumn: (id) =>
        set((state) => ({ columns: state.columns.filter((c) => c.id !== id) })),
      reorderColumns: (fromIdx, toIdx) =>
        set((state) => {
          if (fromIdx === toIdx) return state;
          const copy = [...state.columns];
          const [moved] = copy.splice(fromIdx, 1);
          copy.splice(toIdx, 0, moved);
          return { columns: copy };
        }),
    }),
    {
      name: 'growth-survey-010-settings-v3',
      version: 3,
      migrate: (persisted: unknown, _version: number) => {
        const s = persisted as Partial<SettingsState> & { columns?: unknown[] };
        if (Array.isArray(s.columns)) {
          s.columns = (s.columns as unknown[]).map(migrateColumn);
        }
        if (typeof s.ttsRate !== 'number') s.ttsRate = 1.05;
        if (typeof s.sessionLabelColId !== 'string' && s.sessionLabelColId !== null) s.sessionLabelColId = null;
        if (typeof s.sessionAutoLabel !== 'string' && s.sessionAutoLabel !== null) s.sessionAutoLabel = null;
        if (typeof s.noisyMode !== 'boolean') s.noisyMode = false;
        return s as SettingsState;
      },
    },
  ),
);
