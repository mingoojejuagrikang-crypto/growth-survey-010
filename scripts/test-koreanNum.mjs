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
  // Fix-A: 후치 정정 감지 (숫자로 시작하는 경우만 — 오탐 방지)
  ['178.1 정정', 'modify'],
  ['35.1 정정', 'modify'],
  ['오십 수정', null],          // 한글 숫자 후치는 오탐 우려로 미지원 (전치 "수정 오십" 사용)

  ['취소', 'cancel'],
  ['다시', 'redo'],
  ['종료', 'end'],
  ['스톱', 'end'],
  ['스킵', 'skip'],
  ['건너', 'skip'],
  ['패스', 'skip'],
  ['다음', 'skip'],
  ['일시정지', 'pause'],
  ['정지', 'pause'],
  ['멈춤', 'pause'],
  ['일시중지', 'pause'],
  ['삼', null],
];
for (const [input, expected] of cmdCases) {
  const got = detectCommand(input);
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✓' : '✗'}  detectCommand(${JSON.stringify(input)}) → ${got}`);
}

// Fix-A: extractModifyValue 후치 케이스
const extractCases = [
  ['수정 178.1', '178.1'],
  ['정정 35.1', '35.1'],
  ['178.1 정정', '178.1'],
  ['오십 수정', null],          // detectCommand와 동일하게 null (한글 후치 미지원)
  ['35.1 정정', '35.1'],
];
for (const [input, expected] of extractCases) {
  const got = extractModifyValue(input);
  const ok = got === expected;
  if (ok) pass++;
  else fail++;
  console.log(`${ok ? '✓' : '✗'}  extractModifyValue(${JSON.stringify(input)}) → ${JSON.stringify(got)} ${ok ? '' : `   expected: ${JSON.stringify(expected)}`}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
