// Sanity test for table generation logic (nested sequential columns).
import { computeTotalRows, nestedAutoValue } from '../src/lib/autoValue.ts';

const cols = [
  { id: 'date', name: '조사일자', type: 'date', mode: 'silent', auto: { kind: 'fixed', value: '오늘' } },
  { id: 'tree', name: '나무번호', type: 'int', mode: 'auto', auto: { kind: 'seq', from: 1, to: 10 } },
  { id: 'fruit', name: '과실번호', type: 'int', mode: 'auto', auto: { kind: 'seq', from: 1, to: 5 } },
  { id: 'w', name: '횡경', type: 'float', mode: 'voice', auto: { kind: 'fixed', value: '' } },
];

const total = computeTotalRows(cols);
console.log(`총 행 수: ${total} (예상: 50)`);

// Row 1: tree=1, fruit=1
// Row 5: tree=1, fruit=5
// Row 6: tree=2, fruit=1
// Row 50: tree=10, fruit=5
const cases = [
  [1, 1, 1],
  [2, 1, 2],
  [5, 1, 5],
  [6, 2, 1],
  [10, 2, 5],
  [11, 3, 1],
  [50, 10, 5],
];

let pass = 0, fail = 0;
const tree = cols.find(c => c.id === 'tree');
const fruit = cols.find(c => c.id === 'fruit');

for (const [row, expTree, expFruit] of cases) {
  const t = nestedAutoValue(cols, tree, row);
  const f = nestedAutoValue(cols, fruit, row);
  const ok = t === String(expTree) && f === String(expFruit);
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'}  행 ${row}: 나무=${t} 과실=${f}   (예상: ${expTree}/${expFruit})`);
}

console.log(`\n${total === 50 ? '✓' : '✗'} 총 50행`);
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail || total !== 50 ? 1 : 0);
