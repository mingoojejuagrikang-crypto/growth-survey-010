import JSZip from 'jszip';
import { logger } from './logger';
import { loadAudioClip, loadAllAudioClipKeys, loadLogEvents } from './db';
import { getCurrentEmail } from './googleAuth';

/** Export logs + audio clips as a ZIP.
 *  - `sessionIds` undefined → include ALL events and clips (used by manual LOG button)
 *  - `sessionIds` provided → restrict to those sessions only (used by auto upload after sync)
 *  - Empty array → still produces a device-only ZIP, no events/clips
 *
 *  v5.2 Codex 4차 MEDIUM: events는 IDB(영속)에서 우선 조회 — reload 후에도 보존됨.
 *  v0.10.1: userEmail은 토큰의 검증된 값 (`getCurrentEmail`) 사용 — settingsStore stale 방지.
 */
export async function exportLogZip(sessionIds?: string[]): Promise<Blob> {
  const zip = new JSZip();
  const deviceInfo = await logger.deviceAsync();
  const userEmail = getCurrentEmail();
  const deviceWithUser = { ...deviceInfo, userEmail: userEmail ?? null };
  zip.file('device.json', JSON.stringify(deviceWithUser, null, 2));

  const filterSet = sessionIds ? new Set(sessionIds) : null;

  let events: unknown[];
  try {
    events = await loadLogEvents(sessionIds);
  } catch {
    events = logger.getAll().filter((e) => {
      if (!filterSet) return true;
      return e.sessionId != null && filterSet.has(e.sessionId);
    });
  }
  zip.file('events.json', JSON.stringify(events, null, 2));

  // Include audio clips
  try {
    const keys = await loadAllAudioClipKeys();
    for (const key of keys) {
      if (filterSet) {
        const sid = key.split(':')[0];
        if (!filterSet.has(sid)) continue;
      }
      const blob = await loadAudioClip(key);
      if (blob) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        zip.file(`clips/${key}.${ext}`, blob);
      }
    }
  } catch { /* IDB unavailable */ }

  return zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

export function downloadZip(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
