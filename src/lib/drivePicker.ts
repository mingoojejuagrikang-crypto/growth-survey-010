/**
 * Google Drive Picker integration.
 *
 * Shows a Drive file picker so the user can select a Google Spreadsheet
 * instead of pasting a URL manually.
 *
 * Requirements:
 *   VITE_GOOGLE_API_KEY  — Browser API key (not secret, restricted to Drive API)
 *   OAuth token with drive.readonly scope (handled by googleAuth.ts)
 *
 * The button is only rendered when VITE_GOOGLE_API_KEY is set.
 */

const GAPI_SRC = 'https://apis.google.com/js/api.js';

let gapiPromise: Promise<void> | null = null;
let pickerReady = false;

export interface PickerResult {
  id: string;    // spreadsheetId
  name: string;  // sheet title
  url: string;   // full spreadsheet URL
}

export function getPickerApiKey(): string | null {
  return (import.meta.env.VITE_GOOGLE_API_KEY as string | undefined) || null;
}

function loadGapiScript(): Promise<void> {
  if (gapiPromise) return gapiPromise;
  if (typeof window === 'undefined') return Promise.resolve();
  gapiPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GAPI_SRC;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Google API 스크립트 로드 실패'));
    document.head.appendChild(s);
  });
  return gapiPromise;
}

async function ensurePickerLoaded(): Promise<void> {
  if (pickerReady) return;
  await loadGapiScript();
  await new Promise<void>((resolve, reject) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).gapi.load('picker', {
      callback: () => { pickerReady = true; resolve(); },
      onerror: () => reject(new Error('Picker 라이브러리 로드 실패')),
    });
  });
}

/**
 * Open the Drive file picker filtered to Spreadsheets.
 * Returns the selected spreadsheet info, or null if cancelled.
 */
export async function openDrivePicker(token: string): Promise<PickerResult | null> {
  const apiKey = getPickerApiKey();
  if (!apiKey) throw new Error('VITE_GOOGLE_API_KEY가 .env.local에 설정되지 않았습니다.');
  if (!token) throw new Error('Google 로그인이 필요합니다.');

  await ensurePickerLoaded();

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const g = (window as any).google;
  if (!g?.picker) throw new Error('Google Picker API를 로드할 수 없습니다.');

  return new Promise((resolve) => {
    const view = new g.picker.DocsView(g.picker.ViewId.SPREADSHEETS)
      .setIncludeFolders(false)
      .setSelectFolderEnabled(false);

    const picker = new g.picker.PickerBuilder()
      .setTitle('스프레드시트 선택')
      .addView(view)
      .setOAuthToken(token)
      .setDeveloperKey(apiKey)
      .setLocale('ko')
      .setCallback((data: { action: string; docs?: Array<{ id: string; name: string; url: string }> }) => {
        if (data.action === g.picker.Action.PICKED && data.docs?.[0]) {
          const doc = data.docs[0];
          resolve({
            id: doc.id,
            name: doc.name,
            url: `https://docs.google.com/spreadsheets/d/${doc.id}/edit`,
          });
        } else if (
          data.action === g.picker.Action.CANCEL ||
          data.action === g.picker.Action.LOADED
        ) {
          if (data.action === g.picker.Action.CANCEL) resolve(null);
          // LOADED is informational only — do not resolve yet
        }
      })
      .build();

    picker.setVisible(true);
  });
}
