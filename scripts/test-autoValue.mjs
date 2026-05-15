// Sanity test for table generation logic (nested seq + options).
import { computeTotalRows, nestedAutoValue } from '../src/lib/autoValue.ts';

const cols = [
  { id: 'date',  name: '조사일자', type: 'date',  input: 'auto',  ttsAnnounce: false, auto: { kind: 'fixed', value: '오늘' } },
  { id: 'tree',  name: '나무번호', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 10 } },
  { id: 'fruit', name: '과실번호', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 5 } },
  { id: 'w',     name: '횡경',     type: 'float', input: 'voice', ttsAnnounce: true,  auto: { kind: 'fixed', value: '' } },
];

const total = computeTotalRows(cols);
console.log(`Seq 총 행 수: ${total} (예상: 50)`);

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
console.log(`${total === 50 ? '✓' : '✗'} Seq 총 50행`);

// ─── Options 데이터형 테스트 ───────────────────────────
console.log('\n--- options 데이터형 (다중 선택 순환) ---');
const optsCols = [
  { id: 'farmer', name: '농가명', type: 'options', input: 'auto', ttsAnnounce: true, auto: { kind: 'options', available: ['이원창','양승보','강남호'], selected: ['이원창','양승보'] } },
  { id: 'tree',   name: '나무',   type: 'int',     input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 3 } },
  { id: 'fruit',  name: '과실',   type: 'int',     input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 2 } },
];
const optsTotal = computeTotalRows(optsCols);
console.log(`옵션 총 행 수: ${optsTotal} (예상: 12 = 2 × 3 × 2)`);
// 외부→내부: farmer(2) > tree(3) > fruit(2)
// row 1: 이원창, 1, 1
// row 2: 이원창, 1, 2
// row 3: 이원창, 2, 1
// row 6: 이원창, 3, 2
// row 7: 양승보, 1, 1
// row 12: 양승보, 3, 2
const optsCases = [
  [1, '이원창', '1', '1'],
  [2, '이원창', '1', '2'],
  [3, '이원창', '2', '1'],
  [6, '이원창', '3', '2'],
  [7, '양승보', '1', '1'],
  [12, '양승보', '3', '2'],
];
const farmer = optsCols[0], oTree = optsCols[1], oFruit = optsCols[2];
for (const [row, expF, expT, expFr] of optsCases) {
  const fv = nestedAutoValue(optsCols, farmer, row);
  const tv = nestedAutoValue(optsCols, oTree, row);
  const frv = nestedAutoValue(optsCols, oFruit, row);
  const ok = fv === expF && tv === expT && frv === expFr;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'}  행 ${row}: 농가=${fv} 나무=${tv} 과실=${frv}   (예상: ${expF}/${expT}/${expFr})`);
}
if (optsTotal === 12) pass++; else fail++;

// 빈 selected는 totalRows에 영향 없어야 함
const emptyOpts = [
  { id: 'a', name: 'A', type: 'options', input: 'auto', ttsAnnounce: true, auto: { kind: 'options', available: ['x','y'], selected: [] } },
  { id: 't', name: 'T', type: 'int', input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 5 } },
];
const eTotal = computeTotalRows(emptyOpts);
const eOk = eTotal === 5;
console.log(`${eOk ? '✓' : '✗'}  빈 선택은 totalRows 영향 없음 (${eTotal}, 예상: 5)`);
if (eOk) pass++; else fail++;

// 선택 1개는 고정값처럼 동작
const singleOpts = [
  { id: 'f', name: 'F', type: 'options', input: 'auto', ttsAnnounce: true, auto: { kind: 'options', available: ['x','y'], selected: ['x'] } },
  { id: 't', name: 'T', type: 'int', input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 3 } },
];
const sTotal = computeTotalRows(singleOpts);
const sOk = sTotal === 3 && nestedAutoValue(singleOpts, singleOpts[0], 1) === 'x' && nestedAutoValue(singleOpts, singleOpts[0], 3) === 'x';
console.log(`${sOk ? '✓' : '✗'}  단일 선택은 모든 행에 동일값 (total=${sTotal}, 예상 3)`);
if (sOk) pass++; else fail++;

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
