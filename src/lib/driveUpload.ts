import { getAccessToken } from './googleAuth';

/**
 * Drive log backup target — 관리자(팀 리더) 드라이브의 공유 폴더 ID.
 * 환경변수 VITE_ADMIN_LOGS_FOLDER_ID로 설정. 미설정 시 기존 단일 사용자 모드로 동작.
 * 팀원들은 이 폴더에 Editor 권한으로 공유받아야 함.
 */
export const LOG_FOLDER_ID =
  import.meta.env.VITE_ADMIN_LOGS_FOLDER_ID || '123Qag3EJK2R4imt0vfeZwvJyvQ3yL-lw';

const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const FILES_API = 'https://www.googleapis.com/drive/v3/files';

async function authHeader(): Promise<Record<string, string>> {
  const token = getAccessToken();
  if (!token) throw new Error('Google 로그인이 필요합니다.');
  return { Authorization: `Bearer ${token}` };
}

async function uploadZip(zipBlob: Blob, filename: string, parentId?: string): Promise<string> {
  const metadata: Record<string, unknown> = {
    name: filename,
    mimeType: 'application/zip',
  };
  if (parentId) metadata.parents = [parentId];

  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
  form.append('file', zipBlob);

  const res = await fetch(UPLOAD_API, {
    method: 'POST',
    headers: await authHeader(),
    body: form,
  });
  if (!res.ok) {
    const err = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`Drive 업로드 실패: ${err}`);
  }
  const data = (await res.json()) as { id: string };
  return data.id;
}

/** 관리자 공유 폴더 내에 팀원 이메일 이름의 하위 폴더를 찾거나 생성한다. */
async function ensureTeamSubFolder(parentId: string, userEmail: string): Promise<string> {
  const safeName = userEmail.replace(/'/g, "\\'");
  const q = `'${parentId}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${FILES_API}?q=${encodeURIComponent(q)}&fields=files(id,name)&spaces=drive`;
  const headers = await authHeader();
  const sr = await fetch(searchUrl, { headers });
  if (sr.ok) {
    const data = (await sr.json()) as { files?: { id: string }[] };
    if (data.files && data.files.length > 0) return data.files[0].id;
  }
  // 없으면 생성
  const createRes = await fetch(FILES_API, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: userEmail,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    }),
  });
  if (!createRes.ok) {
    const err = await createRes.text().catch(() => `HTTP ${createRes.status}`);
    throw new Error(`팀원 하위 폴더 생성 실패: ${err}`);
  }
  const created = (await createRes.json()) as { id: string };
  return created.id;
}

/** 사용자 본인 드라이브 (My Drive 루트)에 업로드. */
export async function uploadLogToUserDrive(zipBlob: Blob, filename: string): Promise<string> {
  return uploadZip(zipBlob, filename);
}

/** 관리자 공유 폴더 내 {userEmail}/ 하위 폴더에 업로드. */
export async function uploadLogToAdminTeamFolder(
  zipBlob: Blob,
  filename: string,
  userEmail: string,
): Promise<string> {
  if (!LOG_FOLDER_ID) throw new Error('관리자 폴더 ID 미설정');
  if (!userEmail) throw new Error('사용자 이메일 없음');
  const teamFolderId = await ensureTeamSubFolder(LOG_FOLDER_ID, userEmail);
  return uploadZip(zipBlob, filename, teamFolderId);
}

export interface DualUploadResult {
  userDriveId?: string;
  adminDriveId?: string;
  errors: string[];
}

/** 사용자 본인 드라이브 + 관리자 공유 폴더 둘 다 업로드. 하나 실패해도 다른 쪽은 진행. */
export async function uploadLogToBothDrives(
  zipBlob: Blob,
  filename: string,
  userEmail: string | null,
): Promise<DualUploadResult> {
  const result: DualUploadResult = { errors: [] };

  // 1. 사용자 본인 드라이브
  try {
    result.userDriveId = await uploadLogToUserDrive(zipBlob, filename);
  } catch (e) {
    result.errors.push(`user_drive: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. 관리자 폴더의 팀원 하위 폴더
  if (userEmail) {
    try {
      result.adminDriveId = await uploadLogToAdminTeamFolder(zipBlob, filename, userEmail);
    } catch (e) {
      result.errors.push(`admin_drive: ${e instanceof Error ? e.message : String(e)}`);
    }
  } else {
    result.errors.push('admin_drive: userEmail 없음 — 관리자 폴더 업로드 건너뜀');
  }

  return result;
}

/** @deprecated v0.10부터 uploadLogToBothDrives 사용 권장. 호환성을 위해 유지. */
export async function uploadLogToDrive(zipBlob: Blob, filename: string): Promise<string> {
  return uploadZip(zipBlob, filename, LOG_FOLDER_ID);
}
