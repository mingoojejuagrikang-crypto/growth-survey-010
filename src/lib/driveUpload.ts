import { getAccessToken } from './googleAuth';

/**
 * Drive log backup target.
 * Single-user / single-tenant deployment: this folder is owned by the project user
 * (mingoo.jejuagri.kang@gmail.com) and accessible only with their OAuth token.
 * Future multi-tenant work should make this user-configurable.
 */
export const LOG_FOLDER_ID = '123Qag3EJK2R4imt0vfeZwvJyvQ3yL-lw';
const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

export async function uploadLogToDrive(zipBlob: Blob, filename: string): Promise<string> {
  const token = getAccessToken();
  if (!token) throw new Error('Google 로그인이 필요합니다.');

  const metadata = {
    name: filename,
    parents: [LOG_FOLDER_ID],
    mimeType: 'application/zip',
  };

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', zipBlob);

  const res = await fetch(UPLOAD_API, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });

  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Drive 업로드 실패: ${err}`);
  }

  const data = (await res.json()) as { id: string };
  return data.id;
}
