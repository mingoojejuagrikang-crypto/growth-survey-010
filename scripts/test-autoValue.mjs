// autoValue: seq nesting, options, computeRowFromAutoChange
import { computeTotalRows, nestedAutoValue, autoValue, computeRowFromAutoChange } from '../src/lib/autoValue.ts';

const cols = [
  { id: 'date',  name: '조사일자', type: 'date',  input: 'auto',  ttsAnnounce: false, auto: { kind: 'fixed', value: '오늘' } },
  { id: 'tree',  name: '나무번호', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 10 } },
  { id: 'fruit', name: '과실번호', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 5 } },
  { id: 'w',     name: '횡경',     type: 'float', input: 'voice', ttsAnnounce: true,  auto: { kind: 'fixed', value: '' } },
];

let pass = 0, fail = 0;
function check(label, ok) { if (ok) pass++; else fail++; console.log(`${ok ? '✓' : '✗'}  ${label}`); }

console.log('--- Seq 50행 ---');
check('총 50행', computeTotalRows(cols) === 50);
const tree = cols[1], fruit = cols[2];
[[1,1,1],[5,1,5],[6,2,1],[11,3,1],[50,10,5]].forEach(([r,et,ef]) => {
  const t = nestedAutoValue(cols, tree, r);
  const f = nestedAutoValue(cols, fruit, r);
  check(`행${r} 나무=${t} 과실=${f}`, t === String(et) && f === String(ef));
});

console.log('--- 빈 값 ---');
const emptyCol = { id: 'note', name: '비고', type: 'text', input: 'auto', ttsAnnounce: false, auto: { kind: 'fixed', value: '' } };
check("text 빈 fixed → ''", autoValue(emptyCol, 1) === '');
check("nested 빈 fixed → ''", nestedAutoValue([emptyCol], emptyCol, 1) === '');

console.log('--- Options 순환 ---');
const optsCols = [
  { id: 'farmer', name: '농가명', type: 'options', input: 'auto', ttsAnnounce: true, auto: { kind: 'options', available: ['이원창','양승보'], selected: ['이원창','양승보'] } },
  { id: 'tree',   name: '나무',   type: 'int',     input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 3 } },
  { id: 'fruit',  name: '과실',   type: 'int',     input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 2 } },
];
check('옵션 총 12행', computeTotalRows(optsCols) === 12);
[[1,'이원창','1','1'],[7,'양승보','1','1'],[12,'양승보','3','2']].forEach(([r,ef,et,efr]) => {
  check(`행${r} ${ef}/${et}/${efr}`,
    nestedAutoValue(optsCols, optsCols[0], r) === ef
    && nestedAutoValue(optsCols, optsCols[1], r) === et
    && nestedAutoValue(optsCols, optsCols[2], r) === efr);
});

console.log('--- computeRowFromAutoChange ---');
// 현재 row=15 (나무3, 과실5)
// 나무 → 5 변경: 5는 from=1 이므로 offset=4. 과실 offset=4 유지 → r=(4*5)+4 = 24 → row=25
check('row15 (나무3 과실5) 에서 나무→5 = row25',
  computeRowFromAutoChange(cols, tree, '5', 15) === 25);
// row=15 에서 과실 → 1 변경: tree offset=2 유지, fruit offset=0 → r=(2*5)+0 = 10 → row=11
check('row15 에서 과실→1 = row11',
  computeRowFromAutoChange(cols, fruit, '1', 15) === 11);
// row=1 에서 나무 → 10 = row=46
check('row1 에서 나무→10 = row46',
  computeRowFromAutoChange(cols, tree, '10', 1) === 46);
// 범위 밖 → null
check('나무 → 99 (범위밖) = null',
  computeRowFromAutoChange(cols, tree, '99', 15) === null);
// options 변경
check('row7 (양승보/1/1) 농가→이원창 = row1',
  computeRowFromAutoChange(optsCols, optsCols[0], '이원창', 7) === 1);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
