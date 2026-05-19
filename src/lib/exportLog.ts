import JSZip from 'jszip';
import { logger } from './logger';
import { loadAudioClip, loadAllAudioClipKeys } from './db';

/** Export logs + audio clips as a ZIP.
 *  - `sessionIds` undefined → include ALL events and clips (used by manual LOG button)
 *  - `sessionIds` provided → restrict to those sessions only (used by auto upload after sync)
 *  - Empty array → still produces a device-only ZIP, no events/clips
 */
export async function exportLogZip(sessionIds?: string[]): Promise<Blob> {
  const zip = new JSZip();
  zip.file('device.json', JSON.stringify(logger.device(), null, 2));

  const filterSet = sessionIds ? new Set(sessionIds) : null;
  const events = logger.getAll().filter((e) => {
    if (!filterSet) return true;
    // Without a sessionId tag (e.g. early bootstrap events) → include only when no filter
    return e.sessionId != null && filterSet.has(e.sessionId);
  });
  zip.file('events.json', JSON.stringify(events, null, 2));

  // Include audio clips
  try {
    const keys = await loadAllAudioClipKeys();
    for (const key of keys) {
      if (filterSet) {
        // Clip key format: `${sessionId}:${row}:${colId}` — prefix must match one of the synced IDs
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
