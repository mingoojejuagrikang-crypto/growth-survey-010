// Quick sanity test for the Korean number parser.
// Run with: node scripts/test-koreanNum.mjs
import { parseKoreanNumber, detectCommand, extractModifyValue } from '../src/lib/koreanNum.ts';

const cases = [
  // [input, maxDecimals, expected]
  ['35.1', undefined, '35.1'],
  ['삼십오 점 일', 1, '35.1'],
  ['삼십오점일', 1, '35.1'],
  ['십팔 점 사', 1, '18.4'],
  ['일점오', 1, '1.5'],
  ['이천이십육', undefined, '2026'],
  ['삼', undefined, '3'],
  ['열', undefined, '10'],
  ['열다섯', undefined, '15'],
  ['다섯', undefined, '5'],
  ['  공.오  ', 1, '0.5'],
  ['이십', undefined, '20'],
  ['이십삼', undefined, '23'],
  ['1,000', undefined, '1000'],
  // STT noise: prefer the last short clean number
  ['10,000,000,000,000,199.9', 1, '199.9'],
  ['1,000,000,000,004 나무 오', undefined, '5'],
  ['99999999 종경 33.3', 1, '33.3'],
  ['', undefined, null],
  ['abc', undefined, null],
];

let pass = 0, fail = 0;
for (const [input, maxD, expected] of cases) {
  const got = parseKoreanNumber(input, maxD);
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✓' : '✗'}  parseKoreanNumber(${JSON.stringify(input)}, ${maxD}) → ${JSON.stringify(got)} ${ok ? '' : `   expected: ${JSON.stringify(expected)}`}`);
}

const cmdCases = [
  ['수정', 'modify'],
  ['수정 35.1', 'modify'],
  ['정정 일점오', 'modify'],
  ['취소', 'cancel'],
  ['다시', 'redo'],
  ['종료', 'end'],
  ['스톱', 'end'],
  ['삼', null],
];
for (const [input, expected] of cmdCases) {
  const got = detectCommand(input);
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✓' : '✗'}  detectCommand(${JSON.stringify(input)}) → ${got}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
