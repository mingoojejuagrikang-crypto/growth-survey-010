/**
 * Google Sheets API v4 helpers.
 * All requests use the user's access token from googleAuth.ts.
 */
import { getAccessToken } from './googleAuth';
import type { Column, DataType } from '../types';

const API = 'https://sheets.googleapis.com/v4/spreadsheets';

export interface SheetInfo {
  title: string;
  sheetId: number;
  index: number;
}

export interface SpreadsheetMeta {
  spreadsheetId: string;
  title: string;
  sheets: SheetInfo[];
}

export function parseSpreadsheetId(url: string): string | null {
  const m = url.match(/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  return m ? m[1] : null;
}

async function authFetch(url: string, init?: RequestInit): Promise<Response> {
  const token = getAccessToken();
  if (!token) throw new Error('Google 인증 토큰이 없습니다. 먼저 로그인하세요.');
  const headers = new Headers(init?.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

export async function fetchSpreadsheetMeta(spreadsheetId: string): Promise<SpreadsheetMeta> {
  const r = await authFetch(`${API}/${spreadsheetId}?fields=spreadsheetId,properties.title,sheets.properties`);
  if (!r.ok) throw new Error(`스프레드시트 조회 실패: ${r.status}`);
  const d = (await r.json()) as {
    spreadsheetId: string;
    properties: { title: string };
    sheets: { properties: { sheetId: number; title: string; index: number } }[];
  };
  return {
    spreadsheetId: d.spreadsheetId,
    title: d.properties.title,
    sheets: d.sheets.map((s) => ({
      title: s.properties.title,
      sheetId: s.properties.sheetId,
      index: s.properties.index,
    })),
  };
}

/**
 * Read first N rows of a sheet to:
 *  - get header (row 1)
 *  - sample data rows (rows 2..N) for type inference
 */
export async function fetchHeaderAndSample(
  spreadsheetId: string,
  sheetTitle: string,
  sampleRows = 50,
): Promise<{ headers: string[]; sample: string[][] }> {
  const range = `${encodeURIComponent(sheetTitle)}!A1:Z${sampleRows + 1}`;
  const r = await authFetch(`${API}/${spreadsheetId}/values/${range}`);
  if (!r.ok) throw new Error(`헤더 조회 실패: ${r.status}`);
  const d = (await r.json()) as { values?: string[][] };
  const rows = d.values || [];
  const headers = rows[0] || [];
  const sample = rows.slice(1);
  return { headers, sample };
}

/**
 * Fetch unique values of a single column (by zero-based index), frequency-sorted.
 * Used to surface options for text columns.
 */
export async function fetchColumnUniqueValues(
  spreadsheetId: string,
  sheetTitle: string,
  colIndex: number,
  maxRows = 500,
): Promise<string[]> {
  if (colIndex < 0 || colIndex > 25) return []; // simple A-Z support
  const colLetter = String.fromCharCode(65 + colIndex);
  const range = `${encodeURIComponent(sheetTitle)}!${colLetter}2:${colLetter}${maxRows + 1}`;
  const r = await authFetch(`${API}/${spreadsheetId}/values/${range}`);
  if (!r.ok) return [];
  const d = (await r.json()) as { values?: string[][] };
  const vals = (d.values || []).map((row) => (row[0] || '').toString().trim()).filter(Boolean);
  const freq = new Map<string, number>();
  for (const v of vals) freq.set(v, (freq.get(v) || 0) + 1);
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([v]) => v);
}

/** Guess a DataType from a string sample value */
function guessType(value: string): DataType {
  const v = value.trim();
  if (!v) return 'text';
  if (/^\d{4}-\d{2}-\d{2}$/.test(v) || /^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) return 'date';
  if (/^-?\d+$/.test(v)) return 'int';
  if (/^-?\d+\.\d+$/.test(v)) return 'float';
  return 'text';
}

/**
 * Build Column[] from sheet header + sample data.
 * Heuristics:
 *  - If majority of samples are date/int/float → that type, mode 'voice' for numeric.
 *  - If text and unique values ≤ 8 → suggest 'options' with available pre-filled.
 *  - Otherwise → 'text', input 'auto', ttsAnnounce false.
 */
export function inferColumns(headers: string[], sample: string[][]): Column[] {
  return headers.map((name, ci) => {
    const samples = sample.map((row) => row[ci]).filter(Boolean);
    let type: DataType = 'text';
    if (samples.length) {
      const counts: Record<DataType, number> = { date: 0, text: 0, int: 0, float: 0, options: 0 };
      samples.forEach((v) => {
        counts[guessType(v)]++;
      });
      type = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as DataType) || 'text';
    }

    // If text and small variety, propose options
    let auto: Column['auto'] = { kind: 'fixed', value: '' };
    let input: 'auto' | 'voice' = 'auto';
    let ttsAnnounce = false;
    let decimals: number | undefined;

    if (type === 'int' || type === 'float') {
      input = 'voice';
      ttsAnnounce = true;
      auto = { kind: 'fixed', value: '' };
      decimals = type === 'float' ? 1 : undefined;
    } else if (type === 'date') {
      input = 'auto';
      ttsAnnounce = false;
      auto = { kind: 'fixed', value: '오늘' };
    } else if (type === 'text') {
      const uniq = new Set(samples.map((v) => v.trim()).filter(Boolean));
      if (uniq.size > 0 && uniq.size <= 8) {
        type = 'options';
        const available = [...uniq];
        auto = { kind: 'options', available, selected: available.slice(0, 1) };
      } else {
        auto = { kind: 'fixed', value: '' };
      }
      input = 'auto';
      ttsAnnounce = false;
    }

    return {
      id: `c${ci}_${Date.now()}`,
      name: name || `열 ${ci + 1}`,
      type,
      input,
      ttsAnnounce,
      auto,
      decimals,
    };
  });
}

/** Append a single row to the sheet. */
export async function appendRow(
  spreadsheetId: string,
  sheetTitle: string,
  values: (string | number)[],
): Promise<void> {
  const range = `${encodeURIComponent(sheetTitle)}!A1`;
  const r = await authFetch(
    `${API}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: [values] }),
    },
  );
  if (!r.ok) throw new Error(`행 추가 실패: ${r.status}`);
}

/** Batch append for efficiency (one HTTP request per session sync). */
export async function appendRows(
  spreadsheetId: string,
  sheetTitle: string,
  rows: (string | number)[][],
): Promise<void> {
  const range = `${encodeURIComponent(sheetTitle)}!A1`;
  const r = await authFetch(
    `${API}/${spreadsheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: rows }),
    },
  );
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`행 일괄 추가 실패 (${r.status}): ${t}`);
  }
}
