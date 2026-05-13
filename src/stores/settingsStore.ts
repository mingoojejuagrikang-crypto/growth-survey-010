import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Column, SheetConfig } from '../types';

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

  set: (partial: Partial<Omit<SettingsState, 'set' | 'updateColumn' | 'addColumn' | 'removeColumn' | 'reorderColumns'>>) => void;
  updateColumn: (id: string, next: Column) => void;
  addColumn: () => void;
  removeColumn: (id: string) => void;
  reorderColumns: (fromIdx: number, toIdx: number) => void;
}

const MOCK_COLUMNS: Column[] = [
  { id: 'c1', name: '조사일자', type: 'date', mode: 'silent', auto: { kind: 'fixed', value: '오늘' } },
  { id: 'c2', name: '농가명', type: 'text', mode: 'silent', auto: { kind: 'fixed', value: '강남호' } },
  { id: 'c3', name: '나무번호', type: 'int', mode: 'auto', auto: { kind: 'seq', from: 1, to: 10 } },
  { id: 'c4', name: '과실번호', type: 'int', mode: 'auto', auto: { kind: 'seq', from: 1, to: 5 } },
  { id: 'c5', name: '횡경', type: 'float', mode: 'voice', auto: { kind: 'fixed', value: '' }, decimals: 1 },
  { id: 'c6', name: '종경', type: 'float', mode: 'voice', auto: { kind: 'fixed', value: '' }, decimals: 1 },
];

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      googleConnected: false,
      userEmail: null,
      sheet: null,
      sheetUrl: '',
      sheetTab: '비대조사',
      availableSheets: [],
      manualMode: false,
      columns: MOCK_COLUMNS,
      tableGenerated: false,
      totalRows: 50,

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
              mode: 'voice',
              auto: { kind: 'fixed', value: '' },
            },
          ],
        })),
      removeColumn: (id) =>
        set((state) => ({ columns: state.columns.filter((c) => c.id !== id) })),
      reorderColumns: (fromIdx, toIdx) =>
        set((state) => {
          const copy = [...state.columns];
          const [moved] = copy.splice(fromIdx, 1);
          copy.splice(toIdx, 0, moved);
          return { columns: copy };
        }),
    }),
    { name: 'growth-survey-010-settings' },
  ),
);
