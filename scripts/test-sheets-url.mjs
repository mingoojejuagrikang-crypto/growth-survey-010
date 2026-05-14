import { parseSpreadsheetId } from '../src/lib/sheets.ts';

const cases = [
  ['https://docs.google.com/spreadsheets/d/1_d5L8jI583LN1n6rJ1H8_mPcsKMgEiYnYXhS_JOppDU/edit?usp=drive_link',
   '1_d5L8jI583LN1n6rJ1H8_mPcsKMgEiYnYXhS_JOppDU'],
  ['https://docs.google.com/spreadsheets/d/abc-123/edit', 'abc-123'],
  ['https://docs.google.com/spreadsheets/d/xyz_456/edit#gid=0', 'xyz_456'],
  ['not a url', null],
];

let pass = 0, fail = 0;
for (const [url, expected] of cases) {
  const got = parseSpreadsheetId(url);
  const ok = got === expected;
  if (ok) pass++; else fail++;
  console.log(`${ok ? '✓' : '✗'} ${url.slice(0, 60)} → ${got}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
