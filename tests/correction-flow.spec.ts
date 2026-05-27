/**
 * Correction Flow Tests — 수정/정정 명령 후 진행 검증
 *
 * 검증:
 *  - 같은 행 내 수정 후 정상 진행
 *  - 행 경계 수정 (이전 행 마지막 필드) 후 복귀
 *  - 연속 수정 2~3회 스트레스
 *  - 수정 중 파싱 실패 → 재시도
 *  - "정정"/"수정" 교차 사용
 *  - 실제 5/27 필드 로그 리플레이 (4번 연속 수정)
 */

import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const BASE = 'http://localhost:5175';

const SETTINGS = {
  state: {
    googleConnected: false,
    userEmail: null,
    sheet: null,
    sheetUrl: '',
    sheetTab: '',
    availableSheets: [],
    manualMode: false,
    columns: [
      { id: 'c6', name: '조사나무', type: 'int', input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 2 } },
      { id: 'c7', name: '조사과실', type: 'int', input: 'auto', ttsAnnounce: true, auto: { kind: 'seq', from: 1, to: 5 } },
      { id: 'c8', name: '횡경', type: 'float', input: 'voice', ttsAnnounce: true, auto: { kind: 'fixed', value: '' }, decimals: 1 },
      { id: 'c9', name: '종경', type: 'float', input: 'voice', ttsAnnounce: true, auto: { kind: 'fixed', value: '' }, decimals: 1 },
    ],
    tableGenerated: true,
    totalRows: 10,
    ttsRate: 1.05,
    sessionLabelColId: null,
    sessionAutoLabel: 'correction-test',
    noisyMode: false,
    preferredVoiceName: '',
  },
  version: 3,
};

const MOCK_INIT_SCRIPT = `
(function() {
  window.__ttsLog = [];

  var mockSynth = {
    speak: function(utterance) {
      window.__ttsLog.push(utterance.text);
      try { if (utterance.onstart) utterance.onstart(new Event('start')); } catch(e) {}
      try { if (utterance.onend)   utterance.onend(new Event('end'));     } catch(e) {}
    },
    cancel: function() {},
    pause: function() {},
    resume: function() {},
    getVoices: function() {
      return [{ name: 'Mock Korean', lang: 'ko-KR', default: true, localService: true, voiceURI: 'mock' }];
    },
    speaking: false, pending: false, paused: false, onvoiceschanged: null,
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() { return true; },
  };
  try {
    Object.defineProperty(window, 'speechSynthesis', {
      get: function() { return mockSynth; }, configurable: true, enumerable: true,
    });
  } catch(e1) {
    try {
      Object.defineProperty(Window.prototype, 'speechSynthesis', {
        get: function() { return mockSynth; }, configurable: true,
      });
    } catch(e2) {
      try { window.speechSynthesis = mockSynth; } catch(e3) {}
    }
  }

  var _addStyle = function() {
    var s = document.createElement('style');
    s.textContent = '* { animation-duration: 0ms !important; transition-duration: 0ms !important; }';
    (document.head || document.documentElement).appendChild(s);
  };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _addStyle);
  } else {
    _addStyle();
  }

  function MockSTT() {
    this._ls = {};
    this.continuous = true;
    this.interimResults = true;
    this.lang = 'ko-KR';
    this.maxAlternatives = 3;
    window.__mockSTT = this;
  }
  MockSTT.prototype.addEventListener = function(t, cb) {
    if (!this._ls[t]) this._ls[t] = [];
    this._ls[t].push(cb);
  };
  MockSTT.prototype.removeEventListener = function(t, cb) {
    if (this._ls[t]) this._ls[t] = this._ls[t].filter(function(f) { return f !== cb; });
  };
  MockSTT.prototype.start = function() {
    var self = this;
    setTimeout(function() {
      (self._ls['start'] || []).forEach(function(cb) { cb(new Event('start')); });
    }, 5);
  };
  MockSTT.prototype.stop = function() {};
  MockSTT.prototype.abort = function() {
    var self = this;
    setTimeout(function() {
      (self._ls['end'] || []).forEach(function(cb) { cb(new Event('end')); });
    }, 5);
  };
  MockSTT.prototype.fireResult = function(transcript, confidence) {
    if (confidence === undefined) confidence = 0.95;
    var event = {
      resultIndex: 0,
      results: {
        length: 1,
        0: { isFinal: true, length: 1, 0: { transcript: transcript, confidence: confidence } }
      }
    };
    (this._ls['result'] || []).forEach(function(cb) { cb(event); });
  };
  MockSTT.prototype.fireResultWithAlts = function(transcript, confidence, alts) {
    var alternatives = [{ transcript: transcript, confidence: confidence }];
    for (var i = 0; i < (alts || []).length; i++) {
      alternatives.push({ transcript: alts[i], confidence: confidence * 0.9 });
    }
    var result = { isFinal: true, length: alternatives.length };
    for (var i = 0; i < alternatives.length; i++) result[i] = alternatives[i];
    var event = { resultIndex: 0, results: { length: 1, 0: result } };
    (this._ls['result'] || []).forEach(function(cb) { cb(event); });
  };
  try {
    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockSTT, writable: true, configurable: true, enumerable: true,
    });
  } catch(e1) { try { window.SpeechRecognition = MockSTT; } catch(e2) {} }
  try {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: MockSTT, writable: true, configurable: true, enumerable: true,
    });
  } catch(e) { try { window.webkitSpeechRecognition = MockSTT; } catch(e2) {} }
})();
`;

// ─── Helpers ────────────────────────────────────────────────────

async function fireStt(page: Page, transcript: string, waitMs = 300) {
  await page.evaluate((t) => {
    (window as any).__mockSTT?.fireResult(t, 0.95);
  }, transcript);
  await page.waitForTimeout(waitMs);
}

async function fireSttWithAlts(
  page: Page, transcript: string, confidence: number, alts: string[], waitMs = 300,
) {
  await page.evaluate(({ t, c, a }) => {
    (window as any).__mockSTT?.fireResultWithAlts(t, c, a);
  }, { t: transcript, c: confidence, a: alts });
  await page.waitForTimeout(waitMs);
}

async function getActiveRow(page: Page): Promise<number> {
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/(\d+)\s*\/\s*\d+\s*행/);
  return m ? parseInt(m[1]) : -1;
}

async function getActiveChipName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll('span'))
      .filter((s) => s.textContent?.trim() === '▶');
    if (!spans.length) return '';
    const p = spans[0].closest('div[style]');
    if (!p) return '';
    return (p.textContent || '').replace('▶', '').trim().split('\n')[0].trim();
  });
}

async function waitForActiveChip(page: Page, colName: string, timeout = 5000) {
  await page.waitForFunction(
    (name) => {
      const spans = Array.from(document.querySelectorAll('span'))
        .filter((s) => s.textContent?.trim() === '▶');
      if (!spans.length) return false;
      const p = spans[0].closest('div[style]');
      return (p?.textContent || '').includes(name);
    },
    colName,
    { timeout },
  );
}

async function waitForRow(page: Page, targetRow: number, timeout = 6000) {
  await page.waitForFunction(
    (r) => {
      const m = document.body.innerText.match(/(\d+)\s*\/\s*\d+\s*행/);
      return m && parseInt(m[1]) === r;
    },
    targetRow,
    { timeout },
  );
}

async function setupAndStart(page: Page) {
  await page.addInitScript(MOCK_INIT_SCRIPT);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => {
    localStorage.setItem('growth-survey-010-settings-v3', JSON.stringify(s));
  }, SETTINGS);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(200);

  const startBtn = page.locator('text=음성 입력 시작').first();
  await expect(startBtn).toBeVisible();
  await startBtn.click();
  await page.waitForTimeout(600);
  await expect(page.locator('text=REC').first()).toBeVisible({ timeout: 3000 });
}

async function inputRow(page: Page, h: string, j: string, nextRow?: number) {
  await waitForActiveChip(page, '횡경');
  await fireStt(page, h, 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, j, 300);
  if (nextRow !== undefined) await waitForRow(page, nextRow);
}

async function getIdbSessions(page: Page) {
  return page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const req = indexedDB.open('growth-survey-010');
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('sessions', 'readonly');
    const store = tx.objectStore('sessions');
    const sessions: any[] = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result as any);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return sessions;
  });
}

// ─── Tests ──────────────────────────────────────────────────────

test('같은 행 내 수정 — 횡경 입력 후 수정하여 종경까지 정상 진행', async ({ page }) => {
  await setupAndStart(page);

  await waitForActiveChip(page, '횡경');
  await fireStt(page, '35.1', 300);

  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);

  await waitForActiveChip(page, '횡경');
  const chip = await getActiveChipName(page);
  expect(chip).toContain('횡경');

  await fireStt(page, '36.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '28.3', 300);

  await waitForRow(page, 2);
  expect(await getActiveRow(page)).toBe(2);
});

test('행 경계 수정 — 행 2에서 행 1 마지막 필드 수정 후 복귀', async ({ page }) => {
  await setupAndStart(page);

  await inputRow(page, '35.1', '28.3', 2);

  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);

  expect(await getActiveRow(page)).toBe(1);
  await waitForActiveChip(page, '종경');

  await fireStt(page, '29.0', 500);
  await waitForRow(page, 2);
  await waitForActiveChip(page, '횡경');

  await fireStt(page, '42.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '31.5', 300);
  await waitForRow(page, 3);
});

test('연속 수정 2회 — 같은 필드를 두 번 수정 후 정상 진행', async ({ page }) => {
  await setupAndStart(page);

  await waitForActiveChip(page, '횡경');
  await fireStt(page, '35.1', 300);

  // 수정 1회
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '36.0', 300);

  // 수정 2회
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '37.0', 300);

  await waitForActiveChip(page, '종경');
  await fireStt(page, '28.3', 300);

  await waitForRow(page, 2);
  expect(await getActiveRow(page)).toBe(2);
});

test('연속 수정 3회 + 행 경계 — 행 2에서 행 1을 3번 연속 수정', async ({ page }) => {
  await setupAndStart(page);

  await inputRow(page, '35.1', '28.3', 2);

  // 수정 1회: 행 2 → 행 1 종경
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(1);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '29.0', 500);
  await waitForRow(page, 2);

  // 수정 2회
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(1);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '30.0', 500);
  await waitForRow(page, 2);

  // 수정 3회
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(1);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '31.0', 500);
  await waitForRow(page, 2);

  // 행 2 정상 완료
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '42.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '33.8', 300);
  await waitForRow(page, 3);
});

test('수정 중 파싱 실패 → 재시도 → 정상 진행', async ({ page }) => {
  await setupAndStart(page);

  await waitForActiveChip(page, '횡경');
  await fireStt(page, '35.1', 300);

  // 수정 → 횡경으로
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');

  // 노이즈 워드 입력 (파싱 실패)
  await fireSttWithAlts(page, '광장', 0.70, ['광장', '당장'], 400);

  // 아직 횡경 대기 중
  expect(await getActiveChipName(page)).toContain('횡경');

  // 정상 값 입력
  await fireStt(page, '36.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '28.3', 300);

  await waitForRow(page, 2);
});

test('"정정"과 "수정" 교차 사용 — 두 명령어 동일 동작', async ({ page }) => {
  await setupAndStart(page);

  // Row 1: "정정" 사용
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '35.1', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '정정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '36.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '28.3', 300);
  await waitForRow(page, 2);

  // Row 2: "수정" 사용
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '42.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '43.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '31.5', 300);

  await waitForRow(page, 3);
});

test('실제 5/27 로그 리플레이 — 10행 전체 + 4번 연속 수정', async ({ page }) => {
  await setupAndStart(page);

  // ── Row 1: 횡경 입력 → 수정 → 재입력 ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '10', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '11.1', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '22.2', 300);
  await waitForRow(page, 2);

  // ── Row 2-3: 일반 ──
  await inputRow(page, '33.3', '44.4', 3);
  await inputRow(page, '55.5', '66.6', 4);

  // ── Row 4: 일반 ──
  await inputRow(page, '77.7', '18.8', 5);

  // ── Row 5: 4번 연속 수정 (행 4 종경) ──
  // 수정 1
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(4);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '8.8', 500);
  await waitForRow(page, 5);

  // 수정 2 ("정정")
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '정정', 500);
  expect(await getActiveRow(page)).toBe(4);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '8.8', 500);
  await waitForRow(page, 5);

  // 수정 3
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(4);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '8.8', 500);
  await waitForRow(page, 5);

  // 수정 4 (최종값)
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '수정', 500);
  expect(await getActiveRow(page)).toBe(4);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '88.8', 500);
  await waitForRow(page, 5);

  // ── Row 5: 일반 ──
  await inputRow(page, '99.9', '100', 6);

  // ── Row 6: 수정 포함 ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '111', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '111.1', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '122.2', 300);
  await waitForRow(page, 7);

  // ── Row 7-9: 일반 ──
  await inputRow(page, '133.3', '144.4', 8);
  await inputRow(page, '155.5', '166.6', 9);
  await inputRow(page, '177.7', '188.8', 10);

  // ── Row 10: 수정 포함 + 세션 완료 ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '109.9', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '199.9', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '200', 300);

  // 세션 완료 대기
  await page.waitForTimeout(2000);

  // IDB 값 검증
  const sessions = await getIdbSessions(page);
  expect(sessions.length).toBeGreaterThan(0);
  const session = sessions[sessions.length - 1];
  expect(session.rows.length).toBe(10);

  const val = (row: number, col: string) =>
    session.rows.find((r: any) => r.index === row)?.values?.[col];

  // 수정된 값 검증
  expect(val(1, 'c8')).toBe('11.1');
  expect(val(1, 'c9')).toBe('22.2');
  expect(val(4, 'c8')).toBe('77.7');
  expect(val(4, 'c9')).toBe('88.8');   // 4번 수정 후 최종값
  expect(val(5, 'c8')).toBe('99.9');
  expect(val(5, 'c9')).toBe('100');
  expect(val(6, 'c8')).toBe('111.1');  // 수정 후
  expect(val(6, 'c9')).toBe('122.2');
  expect(val(10, 'c8')).toBe('199.9'); // 수정 후
  expect(val(10, 'c9')).toBe('200');
});

test('마지막 행 수정 후 세션 정상 완료 + IDB 전체 검증', async ({ page }) => {
  await setupAndStart(page);

  // Row 1-9 빠르게 입력
  await inputRow(page, '11.1', '22.2', 2);
  await inputRow(page, '33.3', '44.4', 3);
  await inputRow(page, '55.5', '66.6', 4);
  await inputRow(page, '77.7', '88.8', 5);
  await inputRow(page, '99.9', '100', 6);
  await inputRow(page, '111.1', '122.2', 7);
  await inputRow(page, '133.3', '144.4', 8);
  await inputRow(page, '155.5', '166.6', 9);
  await inputRow(page, '177.7', '188.8', 10);

  // Row 10: 횡경 입력 → 수정 → 재입력 → 종경 → 세션 완료
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '199.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '수정', 500);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '199.9', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '200', 300);

  // 세션 완료 대기
  await page.waitForTimeout(2000);

  // IDB 전체 검증
  const sessions = await getIdbSessions(page);
  expect(sessions.length).toBeGreaterThan(0);
  const session = sessions[sessions.length - 1];
  expect(session.rows.length).toBe(10);

  const expected: Record<number, [string, string]> = {
    1: ['11.1', '22.2'],
    2: ['33.3', '44.4'],
    3: ['55.5', '66.6'],
    4: ['77.7', '88.8'],
    5: ['99.9', '100'],
    6: ['111.1', '122.2'],
    7: ['133.3', '144.4'],
    8: ['155.5', '166.6'],
    9: ['177.7', '188.8'],
    10: ['199.9', '200'],  // 수정 후 최종값
  };

  for (const [row, [h, j]] of Object.entries(expected)) {
    const r = session.rows.find((r: any) => r.index === parseInt(row));
    expect(r, `행 ${row} 누락`).toBeTruthy();
    expect(r.values.c8).toBe(h);
    expect(r.values.c9).toBe(j);
  }
});
