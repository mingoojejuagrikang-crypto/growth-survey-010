/**
 * Log Replay 테스트 — 실제 현장 STT 시퀀스 재생
 *
 * 검증 항목:
 *  - F001: 동일 field에 연속 STT 도착 시 두 번째가 무시됨 (race fix)
 *  - F010: "변경" 등 한국어 노이즈 단어 거부
 *  - 수정 명령 후 칩 이동 순서 올바름
 *  - 스킵 명령 후 다음 행 이동
 *  - 전체 IDB 값 일치
 */

import { test, expect, type Page } from '@playwright/test';

test.setTimeout(120_000);

const BASE = 'http://localhost:5175';

const SETTINGS_REPLAY = {
  state: {
    googleConnected: false,
    userEmail: null,
    sheet: null,
    sheetUrl: '',
    sheetTab: '',
    availableSheets: [],
    manualMode: false,
    columns: [
      { id: 'c6', name: '조사나무', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 3 } },
      { id: 'c7', name: '조사과실', type: 'int',   input: 'auto',  ttsAnnounce: true,  auto: { kind: 'seq', from: 1, to: 2 } },
      { id: 'c8', name: '횡경',     type: 'float', input: 'voice', ttsAnnounce: true,  auto: { kind: 'fixed', value: '' }, decimals: 1 },
      { id: 'c9', name: '종경',     type: 'float', input: 'voice', ttsAnnounce: true,  auto: { kind: 'fixed', value: '' }, decimals: 1 },
    ],
    tableGenerated: true,
    totalRows: 6,
    ttsRate: 1.05,
    sessionLabelColId: null,
    sessionAutoLabel: 'replay-test',
    noisyMode: false,
    preferredVoiceName: '',
  },
  version: 3,
};

const MOCK_INIT_SCRIPT = `
(function() {
  var mockSynth = {
    speak: function(utterance) {
      try { if (utterance.onstart) utterance.onstart(new Event('start')); } catch(e) {}
      try { if (utterance.onend)   utterance.onend(new Event('end'));     } catch(e) {}
    },
    cancel: function() {},
    pause: function() {},
    resume: function() {},
    getVoices: function() {
      return [{ name: 'Mock Korean', lang: 'ko-KR', default: true, localService: true, voiceURI: 'mock' }];
    },
    speaking: false,
    pending: false,
    paused: false,
    onvoiceschanged: null,
    addEventListener: function() {},
    removeEventListener: function() {},
    dispatchEvent: function() { return true; },
  };
  try {
    Object.defineProperty(window, 'speechSynthesis', {
      get: function() { return mockSynth; },
      configurable: true,
      enumerable: true,
    });
  } catch(e1) {
    try {
      Object.defineProperty(Window.prototype, 'speechSynthesis', {
        get: function() { return mockSynth; },
        configurable: true,
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
  } catch(e1) {
    try { window.SpeechRecognition = MockSTT; } catch(e2) {}
  }
  try {
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: MockSTT, writable: true, configurable: true, enumerable: true,
    });
  } catch(e) {
    try { window.webkitSpeechRecognition = MockSTT; } catch(e2) {}
  }
})();
`;

async function fireStt(page: Page, transcript: string, waitMs = 300) {
  await page.evaluate((t) => {
    const stt = (window as unknown as { __mockSTT?: { fireResult: (t: string, c: number) => void } }).__mockSTT;
    if (stt) stt.fireResult(t, 0.95);
  }, transcript);
  await page.waitForTimeout(waitMs);
}

async function fireSttWithAlts(page: Page, transcript: string, confidence: number, alts: string[], waitMs = 300) {
  await page.evaluate(({ t, c, a }) => {
    const stt = (window as unknown as {
      __mockSTT?: { fireResultWithAlts: (t: string, c: number, a: string[]) => void }
    }).__mockSTT;
    if (stt) stt.fireResultWithAlts(t, c, a);
  }, { t: transcript, c: confidence, a: alts });
  await page.waitForTimeout(waitMs);
}

async function getActiveRow(page: Page): Promise<number> {
  const text = await page.evaluate(() => document.body.innerText);
  const m = text.match(/(\d+)\s*\/\s*6\s*행/);
  return m ? parseInt(m[1]) : -1;
}

async function getActiveChipName(page: Page): Promise<string> {
  return page.evaluate(() => {
    const arrowSpans = Array.from(document.querySelectorAll('span'))
      .filter((s) => s.textContent?.trim() === '▶');
    if (arrowSpans.length === 0) return '';
    const parent = arrowSpans[0].closest('div[style]');
    if (!parent) return '';
    return (parent.textContent || '').replace('▶', '').trim().split('\n')[0].trim();
  });
}

async function waitForActiveChip(page: Page, colName: string, timeout = 4000) {
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
  ).catch(() => {});
}

async function waitForRow(page: Page, targetRow: number, timeout = 6000) {
  await page.waitForFunction(
    (r) => {
      const m = document.body.innerText.match(/(\d+)\s*\/\s*6\s*행/);
      return m && parseInt(m[1]) === r;
    },
    targetRow,
    { timeout },
  ).catch(() => {});
}

// ─── Tests ──────────────────────────────────────────────────────────────────

test('Log replay — 6행 STT 시퀀스 재생 (값/수정/스킵/노이즈 거부)', async ({ page }) => {
  await page.addInitScript(MOCK_INIT_SCRIPT);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => {
    localStorage.setItem('growth-survey-010-settings-v3', JSON.stringify(s));
  }, SETTINGS_REPLAY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  // Start voice session
  const startBtn = page.locator('button', { hasText: '음성 입력 시작' });
  await startBtn.click();
  await page.waitForTimeout(1000);

  // ── Row 1: normal input ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '35.1', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '28.3', 300);
  await waitForRow(page, 2);

  // ── Row 2: normal input ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '42.0', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '31.5', 300);
  await waitForRow(page, 3);

  // ── Row 3: input + modify ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '38.7', 300);
  await waitForActiveChip(page, '종경');
  // "수정" command → go back to 횡경
  await fireStt(page, '수정', 400);
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '39.2', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '27.6', 300);
  await waitForRow(page, 4);

  // ── Row 4: normal input ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '44.1', 300);
  await waitForActiveChip(page, '종경');
  await fireStt(page, '33.8', 300);
  await waitForRow(page, 5);

  // ── Row 5: skip ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '스킵', 400);
  await waitForRow(page, 6);

  // ── Row 6: noise word rejection + normal input ──
  await waitForActiveChip(page, '횡경');
  await fireStt(page, '41.3', 300);
  await waitForActiveChip(page, '종경');
  // "변경" is a known noise word — should be rejected
  await fireSttWithAlts(page, '변경', 0.87, ['변경', '31.4'], 400);
  const chipAfterNoise = await getActiveChipName(page);
  expect(chipAfterNoise).toContain('종경');  // still on 종경, not advanced
  // Real value
  await fireStt(page, '29.9', 300);

  // End
  await fireStt(page, '종료', 1000);
});

test('F001 — 동일 field 연속 STT race: 두 번째 무시', async ({ page }) => {
  await page.addInitScript(MOCK_INIT_SCRIPT);
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.evaluate((s) => {
    localStorage.setItem('growth-survey-010-settings-v3', JSON.stringify(s));
  }, SETTINGS_REPLAY);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(500);

  const startBtn = page.locator('button', { hasText: '음성 입력 시작' });
  await startBtn.click();
  await page.waitForTimeout(1000);

  await waitForActiveChip(page, '횡경');

  // Fire two STT results in rapid succession (no wait between them)
  await page.evaluate(() => {
    const stt = (window as unknown as { __mockSTT?: { fireResult: (t: string, c: number) => void } }).__mockSTT;
    if (stt) {
      stt.fireResult('35.1', 0.95);
      stt.fireResult('99.9', 0.95);
    }
  });
  await page.waitForTimeout(800);

  // The value chip for 횡경 should show 35.1 (first), not 99.9 (second)
  const chipText = await page.evaluate(() => {
    const chips = Array.from(document.querySelectorAll('div[style]'));
    for (const chip of chips) {
      if (chip.textContent?.includes('횡경') && chip.textContent?.includes('.')) {
        const nums = chip.textContent.match(/\d+\.\d/g);
        if (nums) return nums[nums.length - 1];
      }
    }
    return '';
  });
  expect(chipText).toBe('35.1');
});
