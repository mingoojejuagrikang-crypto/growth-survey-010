import { useDataStore } from '../stores/dataStore';
import { useSettingsStore } from '../stores/settingsStore';
import { appendRows, parseSpreadsheetId } from './sheets';
import { saveSession } from './db';
import { getAccessToken } from './googleAuth';
import type { Session } from '../types';

export interface SyncFailure {
  sessionId: string;
  sessionDate: string;
  sessionLabel?: string;
  reason: string;
}

export interface SyncReport {
  ok: number;
  failed: number;
  rows: number;
  message?: string;
  failures: SyncFailure[];
  /** Session IDs that were actually appended to the sheet — only these are safe to auto-delete. */
  successIds: string[];
}

/**
 * Push the listed session IDs to the configured Sheets tab.
 * Each session's rows after `syncedRows` are appended.
 */
export async function syncSelected(sessionIds: string[]): Promise<SyncReport> {
  const settings = useSettingsStore.getState();
  const data = useDataStore.getState();
  const report: SyncReport = { ok: 0, failed: 0, rows: 0, failures: [], successIds: [] };

  if (sessionIds.length === 0) {
    report.message = '선택된 세션이 없습니다.';
    return report;
  }
  if (!getAccessToken()) {
    report.message = 'Google 로그인이 필요합니다. 설정 탭에서 로그인 후 다시 시도하세요.';
    return report;
  }
  const spreadsheetId = parseSpreadsheetId(settings.sheetUrl);
  if (!spreadsheetId) {
    report.message = '스프레드시트 URL을 설정하세요.';
    return report;
  }
  if (!settings.sheetTab) {
    report.message = '시트 탭을 선택하세요.';
    return report;
  }

  for (const id of sessionIds) {
    const session = data.sessions.find((x) => x.id === id);
    if (!session) {
      report.failed++;
      report.failures.push({
        sessionId: id, sessionDate: '?',
        reason: '세션을 찾을 수 없습니다.',
      });
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
      report.ok++;
      report.rows += pending.length;
      report.successIds.push(session.id);
    } catch (err) {
      report.failed++;
      report.failures.push({
        sessionId: session.id,
        sessionDate: session.date,
        sessionLabel: session.label,
        reason: (err as Error).message || '알 수 없는 오류',
      });
      console.error('sync failed for', session.id, err);
    }
  }
  return report;
}
