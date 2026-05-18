import JSZip from 'jszip';
import { logger } from './logger';
import { loadAudioClip, loadAllAudioClipKeys } from './db';

export async function exportLogZip(sessionId?: string): Promise<Blob> {
  const zip = new JSZip();
  zip.file('device.json', JSON.stringify(logger.device(), null, 2));

  const events = logger.getAll().filter((e) =>
    !sessionId || e.sessionId === sessionId || !e.sessionId,
  );
  zip.file('events.json', JSON.stringify(events, null, 2));

  // Include audio clips
  try {
    const keys = await loadAllAudioClipKeys();
    for (const key of keys) {
      if (sessionId && !key.startsWith(sessionId)) continue;
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
