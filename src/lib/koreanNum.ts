/**
 * Korean spoken number parser.
 *
 * Supports:
 *  - Sino-Korean: 일~구, 십/백/천/만/억
 *  - Native Korean: 하나/한, 둘/두, 셋/세 … 열
 *  - Decimal separator: 점/쩜
 *  - Mixed STT outputs ("일점오", "1 점 5", "1.5", "35.1")
 *  - Comma noise / leading garbage stripped via shortest-clean-number heuristic
 *
 * Returns numeric string or null.
 */

const SINO: Record<string, number> = {
  영: 0, 공: 0, 일: 1, 이: 2, 삼: 3, 사: 4, 오: 5, 육: 6, 륙: 6, 칠: 7, 팔: 8, 구: 9,
};

const NATIVE: Record<string, number> = {
  하나: 1, 한: 1, 둘: 2, 두: 2, 셋: 3, 세: 3, 넷: 4, 네: 4,
  다섯: 5, 여섯: 6, 일곱: 7, 여덟: 8, 아홉: 9, 열: 10,
};

const SMALL_UNIT: Record<string, number> = { 십: 10, 백: 100, 천: 1000 };
const BIG_UNIT: Record<string, number> = { 만: 10000, 억: 100000000 };

/** Max sensible integer part for measurement domain (mm / g / Brix etc.) */
const OVERFLOW_THRESHOLD = 9999;

function tryArabic(s: string): number | null {
  const cleaned = s.replace(/[,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  // Reject obvious STT noise (e.g. "10,000,000,000,000,199.9")
  const intPart = cleaned.split('.')[0].replace('-', '');
  if (intPart.length > 4 || parseFloat(intPart) > OVERFLOW_THRESHOLD) return null;
  return parseFloat(cleaned);
}

/**
 * Parse a sino-korean compound integer like "이천이십육" → 2026.
 * Walks left to right accumulating digits with unit multipliers.
 */
function parseSinoInt(text: string): number | null {
  if (!text) return null;
  let total = 0;       // accumulator across 만/억 boundaries
  let section = 0;     // accumulator within current 만-section
  let digit = 0;       // last unmultiplied digit
  let consumed = false;

  for (const ch of text) {
    if (SINO[ch] !== undefined) {
      digit = SINO[ch];
      consumed = true;
      continue;
    }
    if (SMALL_UNIT[ch] !== undefined) {
      const u = SMALL_UNIT[ch];
      section += (digit === 0 ? 1 : digit) * u;
      digit = 0;
      consumed = true;
      continue;
    }
    if (BIG_UNIT[ch] !== undefined) {
      const u = BIG_UNIT[ch];
      const localValue = section + digit;
      total += (localValue === 0 ? 1 : localValue) * u;
      section = 0;
      digit = 0;
      consumed = true;
      continue;
    }
    return null;
  }
  if (!consumed) return null;
  return total + section + digit;
}

/** Native korean digits: 다섯 → 5, 열다섯 → 15 */
function parseNativeInt(text: string): number | null {
  if (NATIVE[text] !== undefined) return NATIVE[text];
  if (text.startsWith('열')) {
    const rest = text.slice(1);
    if (!rest) return 10;
    const r = NATIVE[rest];
    if (r !== undefined && r < 10) return 10 + r;
  }
  return null;
}

function parseKoreanInt(token: string): number | null {
  if (!token) return null;
  const a = tryArabic(token);
  if (a !== null) return a;
  const native = parseNativeInt(token);
  if (native !== null) return native;
  return parseSinoInt(token);
}

/** Full Korean-spoken parse including decimal (used by per-token loop). */
function parseKoreanSpokenAll(token: string): number | null {
  if (!token) return null;
  const parts = splitDecimal(token);
  if (parts.length === 1) return parseKoreanInt(parts[0]);
  if (parts.length === 2) {
    const w = parseKoreanInt(parts[0]);
    if (w === null) return null;
    const frac = parseFractionDigits(parts[1]);
    if (!frac) return w;
    const c = parseFloat(`${w}.${frac}`);
    return Number.isFinite(c) ? c : null;
  }
  return null;
}

function splitDecimal(text: string): string[] {
  // "점" / "쩜" / "." can all act as decimal separator when surrounded by Korean digits
  return text.split(/[\s]*[점쩜.][\s]*/);
}

/** Parse fraction digits one symbol at a time (sino > native > arabic). */
function parseFractionDigits(text: string): string {
  let out = '';
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (SINO[c] !== undefined) {
      out += String(SINO[c]);
      i++;
      continue;
    }
    if (/\d/.test(c)) {
      out += c;
      i++;
      continue;
    }
    const three = text.slice(i, i + 3);
    const two = text.slice(i, i + 2);
    const n3 = NATIVE[three];
    const n2 = NATIVE[two];
    if (n3 !== undefined && n3 < 10) { out += String(n3); i += 3; continue; }
    if (n2 !== undefined && n2 < 10) { out += String(n2); i += 2; continue; }
    break;
  }
  return out;
}

/**
 * Try to parse `raw` as a Korean spoken number.
 * `maxDecimals` (optional) rounds the result.
 */
export function parseKoreanNumber(raw: string, maxDecimals?: number): string | null {
  if (!raw) return null;
  const s = raw.replace(/[, 　]/g, ' ').trim();
  if (!s) return null;

  // Fast path: pure arabic.
  const direct = tryArabic(s);
  if (direct !== null) return formatNum(direct, maxDecimals);

  // If the whole string is a clean spoken-Korean number (incl. 점-decimal), parse it.
  const wholeSpoken = parseKoreanSpokenAll(s.replace(/\s+/g, ''));
  if (
    wholeSpoken !== null &&
    Math.abs(wholeSpoken) <= OVERFLOW_THRESHOLD &&
    /^[\s영공일이삼사사오육륙칠팔구하한둘두셋세넷네다섯여섯일곱여덟아홉열십백천만억점쩜.\d]+$/.test(s)
  ) {
    return formatNum(wholeSpoken, maxDecimals);
  }

  // Per-token pass: split by whitespace, prefer the LAST clean small one.
  const tokens = s.split(/\s+/).filter(Boolean);
  if (tokens.length > 1) {
    let lastValid: number | null = null;
    for (const tok of tokens) {
      const a = tryArabic(tok);
      if (a !== null && Math.abs(a) <= OVERFLOW_THRESHOLD) {
        lastValid = a;
        continue;
      }
      const k = parseKoreanSpokenAll(tok);
      if (k !== null && Math.abs(k) <= OVERFLOW_THRESHOLD) {
        lastValid = k;
      }
    }
    if (lastValid !== null) return formatNum(lastValid, maxDecimals);
  }

  // Look for arabic chunks inside text (e.g. STT mixed "값33.5").
  const arabicMatches = Array.from(s.matchAll(/\d+(?:\.\d+)?/g)).map((m) => m[0]);
  if (arabicMatches.length) {
    const candidates = arabicMatches.filter((x) => {
      const intPart = x.split('.')[0];
      return intPart.length <= 4 && parseFloat(intPart) <= OVERFLOW_THRESHOLD;
    });
    if (candidates.length) {
      const n = parseFloat(candidates[candidates.length - 1]);
      if (Number.isFinite(n)) return formatNum(n, maxDecimals);
    }
  }

  // Spoken Korean path
  const parts = splitDecimal(s).map((p) => p.replace(/\s+/g, ''));

  if (parts.length === 1) {
    const n = parseKoreanInt(parts[0]);
    if (n === null) return null;
    return formatNum(n, maxDecimals);
  }

  if (parts.length === 2) {
    const whole = parseKoreanInt(parts[0]);
    if (whole === null) return null;
    const frac = parseFractionDigits(parts[1]);
    if (!frac) return formatNum(whole, maxDecimals);
    const combined = parseFloat(`${whole}.${frac}`);
    if (!Number.isFinite(combined)) return null;
    return formatNum(combined, maxDecimals);
  }

  return null;
}

function formatNum(n: number, maxDecimals?: number): string {
  if (maxDecimals === undefined) return String(n);
  return Number(n.toFixed(maxDecimals)).toString();
}

// ─── Voice commands ────────────────────────────────────────────
export type VoiceCommand = 'modify' | 'cancel' | 'redo' | 'end' | 'skip' | 'pause' | 'resume' | null;

export function detectCommand(raw: string): VoiceCommand {
  const s = raw.replace(/[\s.,]+/g, '');
  if (/^(수정|정정)/.test(s)) return 'modify';                        // 전치: "수정 178.1"
  if (/(수정|정정)$/.test(s) && /^[0-9]/.test(s)) return 'modify';  // 후치: "178.1 정정" (숫자 시작만)
  if (/^(취소|지우기|지워)/.test(s)) return 'cancel';
  if (/^(일시정지|일시중지|멈춤|정지)/.test(s)) return 'pause';
  if (/^(재시작|다시시작|계속)/.test(s)) return 'resume';
  if (/^(다시|재입력)/.test(s)) return 'redo';
  if (/^(스킵|건너|패스|다음)/.test(s)) return 'skip';
  if (/^(종료|끝|마침|스톱|stop)/i.test(s)) return 'end';
  return null;
}

/** "수정 18.4" → "18.4",  "178.1 정정" → "178.1" */
export function extractModifyValue(raw: string): string | null {
  // 전치: "수정 178.1" → "178.1"
  const prefix = raw.match(/(?:수정|정정)[\s,.]*(.+)/);
  if (prefix) return prefix[1].trim();
  // 후치: "178.1 수정" → "178.1"
  const suffix = raw.match(/^(.+?)[\s,.]*(?:수정|정정)$/);
  if (suffix && /^[0-9]/.test(suffix[1].trim())) return suffix[1].trim();
  return null;
}
