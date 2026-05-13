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
 * Push every unsynced row of every session to the connected Sheets tab.
 * Returns counts so the UI can render a summary toast.
 */
export async function syncAll(): Promise<SyncReport> {
  const settings = useSettingsStore.getState();
  const data = useDataStore.getState();

  if (!getAccessToken()) {
    return { ok: 0, failed: 0, rows: 0, message: 'Google 로그인이 필요합니다.' };
  }
  const spreadsheetId = parseSpreadsheetId(settings.sheetUrl);
  if (!spreadsheetId) {
    return { ok: 0, failed: 0, rows: 0, message: '스프레드시트 URL이 설정되지 않았습니다.' };
  }
  if (!settings.sheetTab) {
    return { ok: 0, failed: 0, rows: 0, message: '시트 탭을 선택하세요.' };
  }

  let ok = 0;
  let failed = 0;
  let totalRows = 0;

  for (const session of data.sessions) {
    if (session.syncedRows >= session.completedRows) continue;
    const pending = session.rows.slice(session.syncedRows);
    if (pending.length === 0) continue;
    const colIds = session.columns.map((c) => c.id);
    const matrix = pending.map((row) => colIds.map((id) => row.values[id] ?? ''));
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

/** Auto-trigger on `online` event. */
let onlineHandlerInstalled = false;
export function installAutoSync() {
  if (onlineHandlerInstalled) return;
  onlineHandlerInstalled = true;
  window.addEventListener('online', () => {
    void syncAll();
  });
}
