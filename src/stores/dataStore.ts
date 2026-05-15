import { create } from 'zustand';
import type { Session } from '../types';

interface DataState {
  sessions: Session[];
  expandedSessionId: string | null;
  hydrated: boolean;

  setSessions: (s: Session[]) => void;
  upsertSession: (s: Session) => void;
  removeSession: (id: string) => void;
  toggleExpand: (id: string) => void;
  markSynced: (id: string, count: number) => void;
  setHydrated: (b: boolean) => void;
  /**
   * Edit a single cell. If the edited row index is <= syncedRows,
   * we drop syncedRows back so the row will be re-pushed.
   */
  updateRowValue: (sessionId: string, rowIndex: number, colId: string, value: string) => void;
}

export const useDataStore = create<DataState>((set) => ({
  sessions: [],
  expandedSessionId: null,
  hydrated: false,

  setSessions: (sessions) => set({ sessions }),
  upsertSession: (s) =>
    set((state) => {
      const idx = state.sessions.findIndex((x) => x.id === s.id);
      if (idx === -1) return { sessions: [s, ...state.sessions] };
      const copy = [...state.sessions];
      copy[idx] = s;
      return { sessions: copy };
    }),
  removeSession: (id) =>
    set((state) => ({ sessions: state.sessions.filter((s) => s.id !== id) })),
  toggleExpand: (id) =>
    set((state) => ({ expandedSessionId: state.expandedSessionId === id ? null : id })),
  markSynced: (id, count) =>
    set((state) => ({
      sessions: state.sessions.map((s) => (s.id === id ? { ...s, syncedRows: count } : s)),
    })),
  setHydrated: (hydrated) => set({ hydrated }),
  updateRowValue: (sessionId, rowIndex, colId, value) =>
    set((state) => {
      const sessions = state.sessions.map((s) => {
        if (s.id !== sessionId) return s;
        const rows = s.rows.map((r) =>
          r.index === rowIndex ? { ...r, values: { ...r.values, [colId]: value } } : r,
        );
        // If the edited row was previously synced, demote.
        const newSynced = Math.min(s.syncedRows, rowIndex - 1);
        return { ...s, rows, syncedRows: Math.max(0, newSynced) };
      });
      return { sessions };
    }),
}));
