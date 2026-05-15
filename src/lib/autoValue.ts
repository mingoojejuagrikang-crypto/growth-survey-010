import type { Column } from '../types';

/** Auto-cycling columns are seq columns OR options with selected.length > 1. */
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
 * Used as a fallback when nesting context is not provided.
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
  if (col.auto.kind === 'fixed' && col.auto.value) return col.auto.value;
  return col.type === 'int' ? '0' : '—';
}

/**
 * Total rows = product of spans of all cycling auto columns.
 * Empty options (selected.length === 0) and fixed values contribute 1 (no multiplication).
 */
export function computeTotalRows(columns: Column[]): number {
  const cyclers = columns.filter(isCycling);
  if (cyclers.length === 0) return 1;
  return cyclers.reduce((acc, c) => acc * spanOf(c), 1);
}

/**
 * Compute the auto-value of a column at a given row index considering nesting.
 * Order of cycling columns in the array = outer-to-inner nesting.
 */
export function nestedAutoValue(columns: Column[], targetCol: Column, row: number): string {
  // Non-cycling: defer to simple autoValue
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
    const from = targetCol.auto.from;
    return String(from + offset);
  }
  if (targetCol.auto.kind === 'options') {
    return targetCol.auto.selected[offset] || '';
  }
  return autoValue(targetCol, row);
}
