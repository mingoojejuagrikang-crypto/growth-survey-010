import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { appendRows, parseSpreadsheetId } from './sheets';
import { saveSession } from './db';
import { getAccessToken } from './googleAuth';
import type { Session } from '../types';

export interface SyncReport {
  ok: number;
  failed: number;
  rows: number;
  message?: string;
}

/**
 * Push the listed session IDs to the configured Sheets tab.
 * Each session's rows after `syncedRows` are appended.
 */
export async function syncSelected(sessionIds: string[]): Promise<SyncReport> {
  const settings = useSettingsStore.getState();
  const data = useDataStore.getState();

  if (sessionIds.length === 0) {
    return { ok: 0, failed: 0, rows: 0, message: '선택된 세션이 없습니다.' };
  }
  if (!getAccessToken()) {
    return { ok: 0, failed: 0, rows: 0, message: 'Google 로그인이 필요합니다.' };
  }
  const spreadsheetId = parseSpreadsheetId(settings.sheetUrl);
  if (!spreadsheetId) {
    return { ok: 0, failed: 0, rows: 0, message: '스프레드시트 URL을 설정하세요.' };
  }
  if (!settings.sheetTab) {
    return { ok: 0, failed: 0, rows: 0, message: '시트 탭을 선택하세요.' };
  }

  let ok = 0;
  let failed = 0;
  let totalRows = 0;

  for (const id of sessionIds) {
    const session = data.sessions.find((x) => x.id === id);
    if (!session) {
      failed++;
      continue;
    }
    if (session.syncedRows >= session.completedRows) continue;
    const pending = session.rows.slice(session.syncedRows);
    if (pending.length === 0) continue;
    const colIds = session.columns.map((c) => c.id);
    const matrix = pending.map((row) => colIds.map((colId) => row.values[colId] ?? ''));
    try {
      await appendRows(spreadsheetId, settings.sheetTab, matrix);
      const updated: Session = { ...session, syncedRows: session.completedRows };
      data.upsertSession(updated);
      await saveSession(updated);
      ok++;
      totalRows += pending.length;
    } catch (err) {
      failed++;
      console.error('sync failed for', session.id, err);
    }
  }
  return { ok, failed, rows: totalRows };
}
