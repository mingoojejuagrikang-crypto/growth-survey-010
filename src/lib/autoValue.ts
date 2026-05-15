import type { Column } from '../types';

/** Auto-cycling columns: seq, or options with selected.length > 1. */
function isCycling(col: Column): boolean {
  if (col.input === 'voice') return false;
  if (col.auto.kind === 'seq') return true;
  if (col.auto.kind === 'options' && col.auto.selected.length > 1) return true;
  return false;
}

function spanOf(col: Column): number {
  if (col.auto.kind === 'seq') {
    return Math.max(1, (col.auto.to || 1) - (col.auto.from || 1) + 1);
  }
  if (col.auto.kind === 'options') {
    return Math.max(1, col.auto.selected.length);
  }
  return 1;
}

/**
 * Compute the auto-fill value for a given column on a given row index (1-based).
 * Returns '' for unset/empty fixed values so empty cells stay empty.
 */
export function autoValue(col: Column, row: number): string {
  if (col.auto.kind === 'seq') {
    const from = col.auto.from || 1;
    const span = spanOf(col);
    return String(from + ((row - 1) % span));
  }
  if (col.auto.kind === 'options') {
    const sel = col.auto.selected;
    if (sel.length === 0) return '';
    return sel[(row - 1) % sel.length];
  }
  if (col.type === 'date') {
    if (col.auto.kind === 'fixed' && col.auto.value && col.auto.value !== '오늘')
      return col.auto.value;
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  if (col.auto.kind === 'fixed') return col.auto.value || '';
  return '';
}

export function computeTotalRows(columns: Column[]): number {
  const cyclers = columns.filter(isCycling);
  if (cyclers.length === 0) return 1;
  return cyclers.reduce((acc, c) => acc * spanOf(c), 1);
}

export function nestedAutoValue(columns: Column[], targetCol: Column, row: number): string {
  if (!isCycling(targetCol)) return autoValue(targetCol, row);

  const cyclers = columns.filter(isCycling);
  const idx = cyclers.indexOf(targetCol);
  if (idx < 0) return autoValue(targetCol, row);

  const spans = cyclers.map(spanOf);
  let divisor = 1;
  for (let i = idx + 1; i < spans.length; i++) divisor *= spans[i];
  const span = spans[idx];
  const offset = Math.floor((row - 1) / divisor) % span;

  if (targetCol.auto.kind === 'seq') {
    return String(targetCol.auto.from + offset);
  }
  if (targetCol.auto.kind === 'options') {
    return targetCol.auto.selected[offset] || '';
  }
  return autoValue(targetCol, row);
}

/**
 * Compute the new absolute row index when one cycling column's value changes,
 * preserving the offsets of all other cycling columns.
 *
 * Returns null if the new value is out of range or the column isn't cycling.
 */
export function computeRowFromAutoChange(
  columns: Column[],
  targetCol: Column,
  newValue: string,
  currentRow: number,
): number | null {
  if (!isCycling(targetCol)) return null;
  const cyclers = columns.filter(isCycling);
  const targetIdx = cyclers.indexOf(targetCol);
  if (targetIdx < 0) return null;
  const spans = cyclers.map(spanOf);

  // Current offsets per cycler
  const offsets: number[] = [];
  const cur = currentRow - 1;
  for (let i = 0; i < cyclers.length; i++) {
    let divisor = 1;
    for (let j = i + 1; j < cyclers.length; j++) divisor *= spans[j];
    offsets[i] = Math.floor(cur / divisor) % spans[i];
  }

  // New offset for target
  let newOffset: number | null = null;
  if (targetCol.auto.kind === 'seq') {
    const from = targetCol.auto.from;
    const n = parseInt(newValue, 10);
    if (Number.isNaN(n)) return null;
    newOffset = n - from;
  } else if (targetCol.auto.kind === 'options') {
    newOffset = targetCol.auto.selected.indexOf(newValue);
  }
  if (newOffset === null || newOffset < 0 || newOffset >= spans[targetIdx]) return null;
  offsets[targetIdx] = newOffset;

  // Recombine
  let r = 0;
  for (let i = 0; i < cyclers.length; i++) {
    let divisor = 1;
    for (let j = i + 1; j < cyclers.length; j++) divisor *= spans[j];
    r += offsets[i] * divisor;
  }
  return r + 1;
}

/**
 * Cycling values that are auto-derived for the given row. Useful for diffing
 * "changed since previous row" announcements.
 */
export function buildCyclingValues(
  columns: Column[],
  row: number,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const c of columns) {
    if (c.input === 'voice') continue;
    out[c.id] = nestedAutoValue(columns, c, row);
  }
  return out;
}
