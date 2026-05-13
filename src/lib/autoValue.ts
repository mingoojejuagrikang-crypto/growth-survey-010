import type { Column } from '../types';

/**
 * Compute the auto-fill value for a given column on a given row index (1-based).
 * For sequential int columns, returns `from + (row - 1)` clamped to range.
 * For date columns with no explicit value, returns today.
 */
export function autoValue(col: Column, row: number): string {
  if (col.auto.kind === 'seq') {
    const from = col.auto.from || 1;
    const to = col.auto.to || from;
    const span = Math.max(1, to - from + 1);
    return String(from + ((row - 1) % span));
  }
  if (col.type === 'date') {
    if (col.auto.value && col.auto.value !== '오늘') return col.auto.value;
    const d = new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${d.getFullYear()}-${m}-${day}`;
  }
  if (col.auto.value) return col.auto.value;
  return col.type === 'int' ? '0' : '—';
}

/**
 * Compute the total rows in today's table.
 * Equal to the product of all sequential ranges across columns,
 * with column drag order = outer-to-inner nesting.
 */
export function computeTotalRows(columns: Column[]): number {
  const seqs = columns.filter((c) => c.mode !== 'voice' && c.auto.kind === 'seq');
  if (seqs.length === 0) return 1;
  return seqs.reduce((acc, c) => {
    if (c.auto.kind !== 'seq') return acc;
    const span = Math.max(1, (c.auto.to || 1) - (c.auto.from || 1) + 1);
    return acc * span;
  }, 1);
}

/**
 * Compute the auto-value of a sequential column at a given absolute row index,
 * taking nesting order into account.
 *   row index is 1-based.
 *   outer-most sequential column (first in array) changes slowest.
 */
export function nestedAutoValue(columns: Column[], targetCol: Column, row: number): string {
  if (targetCol.auto.kind !== 'seq') return autoValue(targetCol, row);

  const seqs = columns.filter((c) => c.mode !== 'voice' && c.auto.kind === 'seq');
  if (!seqs.includes(targetCol)) return autoValue(targetCol, row);

  // compute multiplier (inner span product) for each column
  let r = row - 1; // 0-based
  // walk outer→inner: outermost changes after all inner cycle finishes
  // so divisor for col[i] = product of spans[i+1..end]
  const spans = seqs.map((c) => {
    if (c.auto.kind !== 'seq') return 1;
    return Math.max(1, (c.auto.to || 1) - (c.auto.from || 1) + 1);
  });
  const idx = seqs.indexOf(targetCol);
  let divisor = 1;
  for (let i = idx + 1; i < spans.length; i++) divisor *= spans[i];
  const span = spans[idx];
  const offset = Math.floor(r / divisor) % span;
  const from = targetCol.auto.kind === 'seq' ? targetCol.auto.from : 1;
  return String(from + offset);
}
