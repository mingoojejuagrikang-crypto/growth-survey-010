import { create } from 'zustand';

export type VoicePhase = 'ready' | 'active' | 'complete' | 'done';

interface SessionState {
  phase: VoicePhase;
  /** 1-indexed current row */
  activeRow: number;
  /** 0-indexed current column */
  activeColIdx: number;
  /** value currently shown on screen (recognized or being entered) */
  recognizedValue: string;
  /** last TTS message echoed to screen */
  lastTts: string;
  /** values for the current row, by column id */
  currentRowValues: Record<string, string>;

  setPhase: (p: VoicePhase) => void;
  setRecognized: (v: string) => void;
  setLastTts: (v: string) => void;
  setActiveCol: (i: number) => void;
  setActiveRow: (r: number) => void;
  setRowValue: (colId: string, v: string) => void;
  resetRowValues: () => void;
  resetAll: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  phase: 'ready',
  activeRow: 1,
  activeColIdx: 0,
  recognizedValue: '',
  lastTts: '',
  currentRowValues: {},

  setPhase: (phase) => set({ phase }),
  setRecognized: (recognizedValue) => set({ recognizedValue }),
  setLastTts: (lastTts) => set({ lastTts }),
  setActiveCol: (activeColIdx) => set({ activeColIdx }),
  setActiveRow: (activeRow) => set({ activeRow }),
  setRowValue: (colId, v) =>
    set((s) => ({ currentRowValues: { ...s.currentRowValues, [colId]: v } })),
  resetRowValues: () => set({ currentRowValues: {}, recognizedValue: '' }),
  resetAll: () =>
    set({
      phase: 'ready',
      activeRow: 1,
      activeColIdx: 0,
      recognizedValue: '',
      lastTts: '',
      currentRowValues: {},
    }),
}));
