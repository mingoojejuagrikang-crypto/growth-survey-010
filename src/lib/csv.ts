import type { Session } from '../types';

/** Escape a single CSV field per RFC 4180. */
function escapeField(v: string): string {
  if (/[",\n\r]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

/** Convert sessions to a single CSV string with BOM (for Excel Korean). */
export function sessionsToCsv(sessions: Session[]): string {
  if (sessions.length === 0) return '﻿';
  // Collect all column names (use the first session's columns, since each session has its own schema)
  // For mixed sessions, we union all column names.
  const colMap = new Map<string, string>(); // id → name
  for (const s of sessions) {
    for (const c of s.columns) colMap.set(c.id, c.name);
  }
  const colIds = Array.from(colMap.keys());
  const header = ['session_id', 'date', '#', ...colIds.map((id) => colMap.get(id)!)].map(escapeField).join(',');
  const lines: string[] = [header];
  for (const s of sessions) {
    for (const r of s.rows) {
      const cells = [s.id, s.date, String(r.index), ...colIds.map((id) => r.values[id] ?? '')];
      lines.push(cells.map((c) => escapeField(String(c))).join(','));
    }
  }
  return '﻿' + lines.join('\r\n');
}

/** Trigger a browser download of the given CSV text. */
export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
