import { create } from 'zustand';

export type VoicePhase = 'ready' | 'active' | 'paused' | 'complete' | 'done';

interface SessionState {
  phase: VoicePhase;
  /** 1-indexed current row */
  activeRow: number;
  /** 0-indexed current voice column */
  activeColIdx: number;
  /** value currently shown on screen (recognized or being entered) */
  recognizedValue: string;
  /** last TTS message echoed to screen */
  lastTts: string;
  /** All row values, keyed by row index → col id → value */
  allRowValues: Record<number, Record<string, string>>;
  /** Row indices that have been fully completed */
  completedRows: number[];
  /** When user jumps to another row (modify/chip), where to return after that row finishes */
  returnRow: number | null;
  returnColIdx: number | null;

  setPhase: (p: VoicePhase) => void;
  setRecognized: (v: string) => void;
  setLastTts: (v: string) => void;
  setActiveCol: (i: number) => void;
  setActiveRow: (r: number) => void;
  setRowValue: (row: number, colId: string, v: string) => void;
  getRowValues: (row: number) => Record<string, string>;
  markRowComplete: (row: number) => void;
  markRowIncomplete: (row: number) => void;
  isRowComplete: (row: number) => boolean;
  setReturn: (row: number | null, colIdx: number | null) => void;
  resetAll: () => void;
}

export const useSessionStore = create<SessionState>((set, get) => ({
  phase: 'ready',
  activeRow: 1,
  activeColIdx: 0,
  recognizedValue: '',
  lastTts: '',
  allRowValues: {},
  completedRows: [],
  returnRow: null,
  returnColIdx: null,

  setPhase: (phase) => set({ phase }),
  setRecognized: (recognizedValue) => set({ recognizedValue }),
  setLastTts: (lastTts) => set({ lastTts }),
  setActiveCol: (activeColIdx) => set({ activeColIdx }),
  setActiveRow: (activeRow) => set({ activeRow }),

  setRowValue: (row, colId, v) =>
    set((s) => {
      const cur = s.allRowValues[row] || {};
      return {
        allRowValues: { ...s.allRowValues, [row]: { ...cur, [colId]: v } },
      };
    }),

  getRowValues: (row) => get().allRowValues[row] || {},

  markRowComplete: (row) =>
    set((s) => {
      if (s.completedRows.includes(row)) return s;
      return { completedRows: [...s.completedRows, row].sort((a, b) => a - b) };
    }),

  markRowIncomplete: (row) =>
    set((s) => ({ completedRows: s.completedRows.filter((r) => r !== row) })),

  isRowComplete: (row) => get().completedRows.includes(row),

  setReturn: (returnRow, returnColIdx) => set({ returnRow, returnColIdx }),

  resetAll: () =>
    set({
      phase: 'ready',
      activeRow: 1,
      activeColIdx: 0,
      recognizedValue: '',
      lastTts: '',
      allRowValues: {},
      completedRows: [],
      returnRow: null,
      returnColIdx: null,
    }),
}));
