/**
 * Google Sheets API v4 helpers.
 *
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
  sampleRows = 5,
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
 * Default mode = 'voice' for numeric, 'silent' for date/text (user can adjust).
 */
export function inferColumns(headers: string[], sample: string[][]): Column[] {
  return headers.map((name, ci) => {
    const samples = sample.map((row) => row[ci]).filter(Boolean);
    let type: DataType = 'text';
    if (samples.length) {
      // Majority vote across samples
      const counts: Record<DataType, number> = { date: 0, text: 0, int: 0, float: 0 };
      samples.forEach((v) => {
        counts[guessType(v)]++;
      });
      type = (Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] as DataType) || 'text';
    }
    const isNumeric = type === 'int' || type === 'float';
    return {
      id: `c${ci}_${Date.now()}`,
      name: name || `열 ${ci + 1}`,
      type,
      mode: isNumeric ? 'voice' : 'silent',
      auto: type === 'date' ? { kind: 'fixed', value: '오늘' } : { kind: 'fixed', value: '' },
      decimals: type === 'float' ? 1 : undefined,
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
