import { getAccessToken, getCurrentEmail } from './googleAuth';
import { useSettingsStore } from '../stores/settingsStore';

/**
 * Drive log backup target — 관리자(팀 리더) 드라이브의 공유 폴더 ID.
 * 환경변수 VITE_ADMIN_LOGS_FOLDER_ID로 설정. 미설정 시 admin 업로드 단계 건너뜀.
 * 팀원들은 이 폴더에 Editor 권한으로 공유받아야 함.
 */
export const LOG_FOLDER_ID =
  import.meta.env.VITE_ADMIN_LOGS_FOLDER_ID || '123Qag3EJK2R4imt0vfeZwvJyvQ3yL-lw';

const UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
const FILES_API = 'https://www.googleapis.com/drive/v3/files';

/** Google Drive Q 문자열 리터럴 escape — backslash, single-quote 모두 처리. */
function escapeDriveQ(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

/** RFC 5322 단순 검증 (Drive 폴더명으로 받기 전에). */
function isLikelyEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

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

/**
 * 관리자 공유 폴더 내에 팀원 이메일 이름의 하위 폴더를 찾거나 생성한다.
 * Codex 리뷰 반영: race condition 방지를 위해 settingsStore에 캐시, 검색 시 createdTime 정렬로
 * 중복 폴더가 있어도 가장 오래된 것을 선택해 일관성 유지.
 */
async function ensureTeamSubFolder(parentId: string, userEmail: string): Promise<string> {
  // 1. 캐시 확인
  const cached = useSettingsStore.getState().teamFolderId;
  if (cached) {
    return cached;
  }

  const safeName = escapeDriveQ(userEmail);
  const safeParent = escapeDriveQ(parentId);
  // createdTime asc 정렬 → 중복이 있더라도 가장 오래된 폴더로 통일
  const q = `'${safeParent}' in parents and name='${safeName}' and mimeType='application/vnd.google-apps.folder' and trashed=false`;
  const searchUrl = `${FILES_API}?q=${encodeURIComponent(q)}&fields=files(id,name,createdTime)&orderBy=createdTime&spaces=drive`;
  const headers = await authHeader();
  const sr = await fetch(searchUrl, { headers });
  if (sr.ok) {
    const data = (await sr.json()) as { files?: { id: string; createdTime?: string }[] };
    if (data.files && data.files.length > 0) {
      const canonicalId = data.files[0].id;
      // 캐시에 저장 → 다음부터 검색 안 함
      useSettingsStore.getState().set({ teamFolderId: canonicalId });
      return canonicalId;
    }
  } else {
    const errText = await sr.text().catch(() => `HTTP ${sr.status}`);
    throw new Error(`팀원 폴더 검색 실패: ${errText}`);
  }
  // 2. 없으면 생성
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
  useSettingsStore.getState().set({ teamFolderId: created.id });
  return created.id;
}

/** 사용자 본인 드라이브 (My Drive 루트)에 업로드. */
export async function uploadLogToUserDrive(zipBlob: Blob, filename: string): Promise<string> {
  return uploadZip(zipBlob, filename);
}

/** 관리자 공유 폴더 내 {userEmail}/ 하위 폴더에 업로드.
 *  Codex 리뷰: 이메일은 토큰의 검증된 값(`getCurrentEmail`)을 사용 — settingsStore stale 방지.
 */
export async function uploadLogToAdminTeamFolder(zipBlob: Blob, filename: string): Promise<string> {
  if (!LOG_FOLDER_ID) throw new Error('관리자 폴더 ID 미설정');
  const verifiedEmail = getCurrentEmail();
  if (!verifiedEmail || !isLikelyEmail(verifiedEmail)) {
    throw new Error('토큰에서 검증된 이메일을 가져올 수 없음');
  }
  const teamFolderId = await ensureTeamSubFolder(LOG_FOLDER_ID, verifiedEmail);
  return uploadZip(zipBlob, filename, teamFolderId);
}

export interface DualUploadResult {
  userDriveId?: string;
  adminDriveId?: string;
  /** 관리자 폴더가 설정되어 있는지 — backupOk 판정에 사용. */
  adminConfigured: boolean;
  errors: string[];
}

/** 사용자 본인 드라이브 + 관리자 공유 폴더 둘 다 업로드. 하나 실패해도 다른 쪽은 진행. */
export async function uploadLogToBothDrives(
  zipBlob: Blob,
  filename: string,
): Promise<DualUploadResult> {
  const result: DualUploadResult = { errors: [], adminConfigured: !!LOG_FOLDER_ID };

  // 1. 사용자 본인 드라이브
  try {
    result.userDriveId = await uploadLogToUserDrive(zipBlob, filename);
  } catch (e) {
    result.errors.push(`user_drive: ${e instanceof Error ? e.message : String(e)}`);
  }

  // 2. 관리자 폴더의 팀원 하위 폴더 — LOG_FOLDER_ID 설정된 경우만
  if (LOG_FOLDER_ID) {
    try {
      result.adminDriveId = await uploadLogToAdminTeamFolder(zipBlob, filename);
    } catch (e) {
      result.errors.push(`admin_drive: ${e instanceof Error ? e.message : String(e)}`);
      // 캐시된 폴더 ID로 업로드 실패 시 캐시 무효화 — 다음 시도에 재검색
      if (useSettingsStore.getState().teamFolderId) {
        useSettingsStore.getState().set({ teamFolderId: null });
      }
    }
  }

  return result;
}

/** @deprecated v0.10부터 uploadLogToBothDrives 사용 권장. 호환성을 위해 유지. */
export async function uploadLogToDrive(zipBlob: Blob, filename: string): Promise<string> {
  return uploadZip(zipBlob, filename, LOG_FOLDER_ID);
}
