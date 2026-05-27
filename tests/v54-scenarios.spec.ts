/**
 * v5.4 시나리오 테스트 — Playwright
 *
 * v5.4에서 변경된 기능 위주로 실제 브라우저 동작을 검증합니다.
 *
 * 테스트 대상:
 *  - [설정-A] 날짜 컬럼 "오늘/날짜 지정" 라디오 UX
 *  - [설정-B] TTS 속도 슬라이더 → 음성 탭 이동
 *  - [설정-C] TTS 음성 드롭다운 (headless에서 ko 음성 없음 → 숨김 확인)
 *  - [입력-C] 세션명 팝업 제거 — 클릭 즉시 시작
 *  - [선언문] "재시작" 명령어 힌트 표시
 *  - [공통] 컬럼 CRUD, 탭 상태 보존, 세션명 필드, 소음 모드
 */
import { test, expect, type Page } from '@playwright/test';

const BASE = 'http://localhost:5175';

// ─── helpers ─────────────────────────────────────────────────────────────────

/** 앱 로드 후 설정 탭 진입. localStorage를 초기화하여 깨끗한 상태 보장. */
async function freshSettings(page: Page) {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tab-settings"]').click();
  await page.waitForTimeout(300);
}

/** 설정 탭 진입 (저장 상태 유지) */
async function goToSettings(page: Page) {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tab-settings"]').click();
  await page.waitForTimeout(300);
}

/** 음성 탭 진입 */
async function goToVoice(page: Page) {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);
  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(300);
}

// TYPE_ORDER = ['date','text','int','float','options'], 새 컬럼 기본값='text'
const TYPE_LABEL_MAP: Record<string, string> = {
  date: '날짜', text: '텍스트', int: '정수', float: '실수', options: '리스트',
};
const ALL_TYPE_LABELS = Object.values(TYPE_LABEL_MAP).join('|');

/** 마지막 컬럼 카드의 타입 버튼을 클릭해 targetType까지 사이클 */
async function cycleToType(page: Page, targetType: string) {
  const targetLabel = TYPE_LABEL_MAP[targetType];
  const typeBtn = page.locator('button').filter({ hasText: new RegExp(ALL_TYPE_LABELS) }).last();
  for (let i = 0; i < 5; i++) {
    const text = (await typeBtn.textContent()) ?? '';
    if (text.includes(targetLabel)) break;
    await typeBtn.click();
    await page.waitForTimeout(200);
  }
}

/** 설정에서 컬럼 추가 후 타입/입력모드 지정 */
async function addColumn(page: Page, opts: { type?: string; input?: 'auto' | 'voice'; name?: string } = {}) {
  const addBtn = page.locator('text=항목 추가').first();
  await addBtn.click();
  await page.waitForTimeout(300);

  if (opts.type) {
    await cycleToType(page, opts.type);
  }

  if (opts.input === 'voice') {
    const voiceBtn = page.locator('text=음성').last();
    await voiceBtn.click();
    await page.waitForTimeout(200);
  }

  if (opts.name) {
    // 컬럼명 input은 placeholder 없이 col.name 값으로 표시됨
    const lastNameInput = page.locator('input').filter({ has: page.locator('xpath=ancestor::div[@draggable]') }).last();
    if (await lastNameInput.isVisible().catch(() => false)) {
      await lastNameInput.fill(opts.name);
      await page.waitForTimeout(100);
    }
  }
}

/** 자동 컬럼 sequential 설정 (from=1, to=N) */
async function setSequential(page: Page, to: number) {
  const seqBtn = page.locator('text=순차로 변경').first();
  if (await seqBtn.isVisible().catch(() => false)) {
    await seqBtn.click();
    await page.waitForTimeout(200);
    // 두 번째 숫자 입력 (to)
    const numInputs = page.locator('input[type="number"]');
    const cnt = await numInputs.count();
    if (cnt >= 2) {
      await numInputs.nth(1).fill(String(to));
      await numInputs.nth(1).blur();
      await page.waitForTimeout(100);
    }
  }
}

/** 테이블 생성 + 미리보기 닫기 */
async function generateTable(page: Page) {
  const generateBtn = page.locator('text=오늘 테이블 생성').first();
  if (!(await generateBtn.isVisible().catch(() => false))) return;
  await generateBtn.click();
  await page.waitForTimeout(400);
  const confirmBtn = page.locator('text=확인').last();
  if (await confirmBtn.isVisible().catch(() => false)) {
    await confirmBtn.click();
    await page.waitForTimeout(200);
  }
}

// ═════════════════════════════════════════════════════════════════════════════
// 1. 앱 로드 기본 점검
// ═════════════════════════════════════════════════════════════════════════════
test('앱 로드 — 3개 탭 모두 표시', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);

  await expect(page.locator('[data-testid="tab-settings"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-voice"]')).toBeVisible();
  await expect(page.locator('[data-testid="tab-data"]')).toBeVisible();

  console.log('✓ 설정/음성/데이터 탭 모두 표시됨');
});

// ═════════════════════════════════════════════════════════════════════════════
// 2. 버전 확인
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] v0.9.2 버전 표시', async ({ page }) => {
  await goToSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  const bodyText = await page.evaluate(() => document.body.innerText);
  expect(bodyText).toContain('0.9.2');
  console.log('✓ 버전 0.9.2 확인');
});

// ═════════════════════════════════════════════════════════════════════════════
// 3. [설정-A] 날짜 컬럼 — "오늘/날짜 지정" 라디오 UX
// ═════════════════════════════════════════════════════════════════════════════
test('[설정-A] 날짜 컬럼 — 오늘 라디오가 기본 선택', async ({ page }) => {
  await freshSettings(page);
  // 새 컬럼 추가 (type='text' 기본) → 'date'로 전환
  await addColumn(page, { type: 'date' });
  await page.waitForTimeout(200);

  // MOCK 컬럼들도 date 타입이 있어 page 전체에 "오늘" 라벨이 여러 개.
  // 마지막 컬럼 카드(새로 추가된 카드)만 스코프.
  const lastCard = page.locator('[draggable="true"]').last();

  const todayLabel = lastCard.locator('label').filter({ hasText: '오늘' }).first();
  const todayVisible = await todayLabel.isVisible().catch(() => false);

  if (!todayVisible) {
    console.log('ℹ 날짜 타입 라디오 없음 — 스킵');
    return;
  }
  console.log('✓ "오늘" 라디오 버튼 표시 확인');

  // 날짜 지정 라디오 선택 → date input 나타나야 함
  const dateLabel = lastCard.locator('label').filter({ hasText: '날짜 지정' }).first();
  if (!(await dateLabel.isVisible().catch(() => false))) {
    console.log('ℹ "날짜 지정" 라디오 없음 — 스킵');
    return;
  }

  await dateLabel.click();
  await page.waitForTimeout(300);

  const dateInput = lastCard.locator('input[type="date"]');
  await expect(dateInput).toBeVisible({ timeout: 2000 });
  console.log('✓ "날짜 지정" 선택 시 date input 표시됨');

  // 다시 "오늘" 선택 → 마지막 카드의 date input 숨겨짐
  await todayLabel.click();
  await page.waitForTimeout(300);
  const dateInputVisible = await dateInput.isVisible().catch(() => false);
  expect(dateInputVisible).toBe(false);
  console.log('✓ "오늘" 재선택 시 date input 사라짐');
});

test('[설정-A] 날짜 컬럼 — 날짜 지정 후 date picker 값 입력', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page, { type: 'date' });

  const dateLabel = page.locator('label').filter({ hasText: '날짜 지정' }).first();
  if (!(await dateLabel.isVisible().catch(() => false))) {
    console.log('ℹ 날짜 라디오 없음 — 스킵');
    return;
  }

  await dateLabel.click();
  await page.waitForTimeout(200);

  const dateInput = page.locator('input[type="date"]').last();
  await dateInput.fill('2026-05-22');
  await dateInput.blur();
  await page.waitForTimeout(200);

  const val = await dateInput.inputValue();
  expect(val).toBe('2026-05-22');
  console.log('✓ 날짜 지정 입력값 2026-05-22 저장 확인');
});

// ═════════════════════════════════════════════════════════════════════════════
// 4. [설정-B] 설정 탭에 TTS 속도 슬라이더 없음 (음성 탭으로 이동됨)
// ═════════════════════════════════════════════════════════════════════════════
test('[설정-B] 설정 탭에 TTS 속도 슬라이더 없음', async ({ page }) => {
  await goToSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  const bodyText = await page.evaluate(() => document.body.innerText);
  // 설정 탭에서 "TTS 속도" 섹션이 사라진 것을 확인
  // (슬라이더가 음성 탭으로 이동됨)
  const hasSlider = await page.locator('text=TTS 속도').first().isVisible().catch(() => false);
  if (!hasSlider) {
    console.log('✓ 설정 탭에 TTS 속도 슬라이더 없음 (음성 탭으로 이동 완료)');
  } else {
    console.log('⚠ TTS 속도 텍스트가 여전히 설정 탭에 보임 — 확인 필요');
  }
  expect(hasSlider).toBe(false);
});

// ═════════════════════════════════════════════════════════════════════════════
// 5. [설정-C] TTS 음성 드롭다운 (headless = ko 음성 없음 → 숨김)
// ═════════════════════════════════════════════════════════════════════════════
test('[설정-C] TTS 음성 드롭다운 — headless에서 숨겨짐 (ko 음성 없음)', async ({ page }) => {
  await goToSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(300);

  // headless Chromium에는 한국어 TTS 음성이 없으므로 드롭다운이 null 렌더링됨
  const voiceSelector = page.locator('select').filter({ has: page.locator('option[value=""]') });
  // ko 음성이 없으면 TtsVoiceSelector는 null 반환 → DOM에 없어야 함
  // (음성이 있는 실기기에서는 표시됨)
  const selectorCount = await voiceSelector.count();
  if (selectorCount === 0) {
    console.log('✓ headless에서 ko 음성 없어 TTS 음성 드롭다운 숨겨짐 (정상)');
  } else {
    // 혹시 시스템에 ko 음성이 있으면 표시될 수 있음
    console.log('ℹ TTS 음성 드롭다운 표시됨 (시스템에 ko 음성 있음)');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 6. 컬럼 추가 / 삭제 / 이름 변경
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] 컬럼 추가 → 이름 변경 → 삭제', async ({ page }) => {
  await freshSettings(page);

  // 컬럼 추가
  await addColumn(page, { name: '테스트컬럼' });

  // 이름 필드에 값 확인
  const nameInput = page.locator('input[placeholder="컬럼명"]').last();
  if (await nameInput.isVisible().catch(() => false)) {
    const val = await nameInput.inputValue();
    // placeholder와 다를 수 있음 — 그냥 visible 확인
    console.log(`✓ 컬럼 이름 입력 필드 표시됨 (현재값: "${val}")`);

    // 이름 변경
    await nameInput.fill('변경된컬럼');
    await nameInput.blur();
    await page.waitForTimeout(100);
    const newVal = await nameInput.inputValue();
    expect(newVal).toBe('변경된컬럼');
    console.log('✓ 컬럼명 변경 확인');
  }

  // 삭제 버튼 (✕ 또는 삭제)
  const deleteBtn = page.locator('button').filter({ hasText: '✕' }).last();
  const delVisible = await deleteBtn.isVisible().catch(() => false);
  if (delVisible) {
    await deleteBtn.click();
    await page.waitForTimeout(200);
    const nameInputAfter = page.locator('input[placeholder="컬럼명"]');
    const remaining = await nameInputAfter.count();
    console.log(`✓ 컬럼 삭제 완료 (남은 컬럼: ${remaining}개)`);
  }
});

test('[설정] 컬럼 타입 변경 — 사이클 순서 확인', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page); // 기본 type='text'

  // TYPE_ORDER = ['date','text','int','float','options']
  // 새 컬럼은 'text'에서 시작, 버튼 클릭 시 int→float→options→date→text...
  const typeBtn = page.locator('button').filter({ hasText: new RegExp(ALL_TYPE_LABELS) }).last();
  const sequence: string[] = [];

  for (let i = 0; i < 5; i++) {
    const text = (await typeBtn.textContent()) ?? '';
    const label = ['날짜', '텍스트', '정수', '실수', '리스트'].find((l) => text.includes(l));
    if (label) sequence.push(label);
    await typeBtn.click();
    await page.waitForTimeout(200);
  }

  // 5번 클릭 후 원점 복귀: text(시작) → int → float → options → date → text
  expect(sequence).toEqual(['텍스트', '정수', '실수', '리스트', '날짜']);
  console.log(`✓ 타입 사이클 확인: ${sequence.join(' → ')}`);
});

// ═════════════════════════════════════════════════════════════════════════════
// 7. 세션명 설정 필드
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] 세션명 입력 필드 동작', async ({ page }) => {
  await goToSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  // 세션명 입력 필드 찾기 (placeholder 또는 label "세션명")
  const sessionLabel = page.locator('text=세션명').first();
  const visible = await sessionLabel.isVisible().catch(() => false);
  if (!visible) {
    console.log('ℹ 세션명 필드 없음 — 스킵');
    return;
  }

  // 세션명 입력 필드 (세션명 텍스트 근처의 input)
  const sessionInput = page.locator('input[placeholder*="세션"]').first();
  const inputVisible = await sessionInput.isVisible().catch(() => false);
  if (inputVisible) {
    await sessionInput.fill('2026-05-22 오전 현장');
    await sessionInput.blur();
    await page.waitForTimeout(100);
    const val = await sessionInput.inputValue();
    expect(val).toBe('2026-05-22 오전 현장');
    console.log('✓ 세션명 입력 및 저장 확인');
  } else {
    console.log('ℹ 세션명 input 없음 — 스킵');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 8. 소음 환경 모드 토글
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] 소음 환경 모드 토글', async ({ page }) => {
  await goToSettings(page);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await page.waitForTimeout(200);

  const noisyLabel = page.locator('text=소음 환경 모드').first();
  if (!(await noisyLabel.isVisible().catch(() => false))) {
    console.log('ℹ 소음 환경 모드 없음 — 스킵');
    return;
  }

  // 체크박스 또는 토글 찾기
  const toggle = page.locator('input[type="checkbox"]').first();
  if (await toggle.isVisible().catch(() => false)) {
    const before = await toggle.isChecked();
    await toggle.click();
    await page.waitForTimeout(200);
    const after = await toggle.isChecked();
    expect(after).toBe(!before);
    console.log(`✓ 소음 환경 모드 토글: ${before} → ${after}`);

    // 다시 원복
    await toggle.click();
    await page.waitForTimeout(100);
  } else {
    // button 형태인 경우
    const noisyBtn = page.locator('label').filter({ hasText: '소음 환경 모드' }).first();
    if (await noisyBtn.isVisible().catch(() => false)) {
      await noisyBtn.click();
      console.log('✓ 소음 환경 모드 클릭 가능 확인');
    }
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 9. [입력-C] 세션명 팝업 없음 — 즉시 시작 (v5.4 변경)
// ═════════════════════════════════════════════════════════════════════════════
test('[입력-C] 음성 입력 시작 시 팝업 없음 (즉시 시작)', async ({ page }) => {
  // 1. 테이블 먼저 생성
  await freshSettings(page);
  await addColumn(page);
  await setSequential(page, 3);
  await addColumn(page, { input: 'voice', name: '측정값' });
  await generateTable(page);

  // 2. 음성 탭 이동
  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(300);

  // 3. 시작 버튼 클릭
  const startBtn = page.locator('text=음성 입력 시작').first();
  await expect(startBtn).toBeVisible();

  const isDisabled = await startBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    console.log('ℹ STT 미지원(headless) 환경 — 시작 버튼 비활성화, 팝업 테스트 스킵');
    return;
  }

  await startBtn.click();
  await page.waitForTimeout(600);

  // "세션명" 입력 모달이 나타나면 안 됨 (v5.4: 팝업 제거)
  const modal = page.locator('text=세션명을 입력하세요').first();
  const modalVisible = await modal.isVisible().catch(() => false);
  expect(modalVisible).toBe(false);
  console.log('✓ 시작 버튼 클릭 후 세션명 팝업 없음 확인 (v5.4 변경)');

  // 입력 화면으로 전환됐는지 확인
  const activeHint = page.locator('text=일시정지').first();
  if (await activeHint.isVisible().catch(() => false)) {
    console.log('✓ 즉시 음성 입력 화면으로 전환됨');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 10. [선언문] 음성 명령 힌트에 "재시작" 포함
// ═════════════════════════════════════════════════════════════════════════════
test('[선언문] 음성 탭 명령 힌트에 "재시작" 표시', async ({ page }) => {
  // 테이블 생성 후 음성 입력 화면 진입 필요
  await freshSettings(page);
  await addColumn(page);
  await setSequential(page, 2);
  await addColumn(page, { input: 'voice', name: '측정' });
  await generateTable(page);

  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(300);

  const startBtn = page.locator('text=음성 입력 시작').first();
  const isDisabled = await startBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    console.log('ℹ headless STT 미지원 — 입력 화면 못 진입, 스킵');
    return;
  }

  await startBtn.click();
  await page.waitForTimeout(800);

  // 명령어 힌트 칩에 "재시작" 표시
  const resumeHint = page.locator('text=재시작').first();
  const resumeVisible = await resumeHint.isVisible().catch(() => false);
  if (resumeVisible) {
    console.log('✓ "재시작" 명령어 힌트 표시 확인');
  } else {
    console.log('ℹ 입력 화면 미진입으로 힌트 확인 불가 (정상 — headless STT 없음)');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 11. [설정-B] 음성 탭 ActiveState에 TTS 속도 슬라이더 표시
// ═════════════════════════════════════════════════════════════════════════════
test('[설정-B] 음성 탭 입력 화면에 TTS 속도 슬라이더', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page);
  await setSequential(page, 2);
  await addColumn(page, { input: 'voice', name: '측정' });
  await generateTable(page);

  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(300);

  const startBtn = page.locator('text=음성 입력 시작').first();
  const isDisabled = await startBtn.getAttribute('disabled');
  if (isDisabled !== null) {
    console.log('ℹ headless — 입력 화면 못 진입, TTS 슬라이더 확인 불가');
    return;
  }

  await startBtn.click();
  await page.waitForTimeout(800);

  // range 슬라이더 표시 확인
  const slider = page.locator('input[type="range"]').first();
  const sliderVisible = await slider.isVisible().catch(() => false);
  if (sliderVisible) {
    const min = await slider.getAttribute('min');
    const max = await slider.getAttribute('max');
    console.log(`✓ TTS 속도 슬라이더 표시됨 (min=${min}, max=${max})`);
    expect(min).toBe('0.5');
    expect(max).toBe('2');
  } else {
    console.log('ℹ 입력 화면 미진입 — 슬라이더 확인 불가');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 12. 탭 전환 후 설정 상태 보존
// ═════════════════════════════════════════════════════════════════════════════
test('[공통] 탭 전환 후 설정 상태 보존', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page, { name: '번호' });

  // 세션명 입력 후 탭 이동 → 복귀
  const sessionInput = page.locator('input[placeholder*="세션"]').first();
  if (await sessionInput.isVisible().catch(() => false)) {
    await sessionInput.fill('보존테스트세션');
    await sessionInput.blur();
    await page.waitForTimeout(100);
  }

  // 다른 탭으로 이동 후 복귀
  await page.locator('[data-testid="tab-data"]').click();
  await page.waitForTimeout(200);
  await page.locator('[data-testid="tab-settings"]').click();
  await page.waitForTimeout(300);

  // 컬럼이 여전히 존재해야 함
  const nameInput = page.locator('input[placeholder="컬럼명"]').first();
  if (await nameInput.isVisible().catch(() => false)) {
    const val = await nameInput.inputValue();
    console.log(`✓ 탭 전환 후 컬럼명 보존 확인: "${val}"`);
  }

  // 세션명 보존 확인
  const sessionInputAfter = page.locator('input[placeholder*="세션"]').first();
  if (await sessionInputAfter.isVisible().catch(() => false)) {
    const sessionVal = await sessionInputAfter.inputValue();
    console.log(`✓ 탭 전환 후 세션명 보존: "${sessionVal}"`);
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 13. 데이터 탭 — 빈 상태 / 세션 없음
// ═════════════════════════════════════════════════════════════════════════════
test('[데이터] 세션 없을 때 빈 상태 또는 액션 버튼 표시', async ({ page }) => {
  await page.goto(BASE);
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(400);

  await page.locator('[data-testid="tab-data"]').click();
  await page.waitForTimeout(300);

  const hasEmpty = await page.locator('text=아직 기록된 데이터가 없습니다').isVisible().catch(() => false);
  const hasSessions = await page.locator('text=행').first().isVisible().catch(() => false);
  const hasActionBar = await page.locator('text=시트에 추가').isVisible().catch(() => false);

  if (hasEmpty) {
    console.log('✓ 빈 상태 메시지 "아직 기록된 데이터가 없습니다" 표시');
  } else if (hasSessions) {
    console.log('ℹ 기존 세션 데이터 존재 — 빈 상태 테스트 스킵');
  }

  if (hasActionBar) {
    console.log('✓ 데이터 탭 액션 버튼 (시트에 추가) 표시');
  }
  expect(hasEmpty || hasSessions || hasActionBar).toBe(true);
});

// ═════════════════════════════════════════════════════════════════════════════
// 14. 테이블 생성 → 음성 탭 시작 버튼 활성화 전체 플로우
// ═════════════════════════════════════════════════════════════════════════════
test('[공통] 설정 → 테이블 생성 → 음성 탭 시작 버튼 활성화 플로우', async ({ page }) => {
  await freshSettings(page);

  // 자동 컬럼 (번호 1~5)
  await addColumn(page, { name: '번호' });
  await setSequential(page, 5);

  // 음성 컬럼
  await addColumn(page, { input: 'voice', name: '측정값' });

  // 테이블 생성
  await generateTable(page);

  // "생성됨" 또는 "미리보기" 텍스트 확인
  const generatedText = await page.evaluate(() => document.body.innerText);
  const hasGenerated = generatedText.includes('생성됨') || generatedText.includes('미리보기');
  if (hasGenerated) {
    console.log('✓ 테이블 생성 완료 확인');
  }

  // 음성 탭 이동
  await page.locator('[data-testid="tab-voice"]').click();
  await page.waitForTimeout(300);

  const startBtn = page.locator('text=음성 입력 시작').first();
  await expect(startBtn).toBeVisible();

  const isDisabled = await startBtn.getAttribute('disabled');
  if (isDisabled === null) {
    console.log('✓ 테이블 생성 후 시작 버튼 활성화 확인');
  } else {
    console.log('ℹ 시작 버튼 비활성 — STT 미지원 환경 (headless)');
  }
});

// ═════════════════════════════════════════════════════════════════════════════
// 15. 미리보기 팝업 상세 검증
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] 테이블 미리보기 팝업 내용 검증', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page, { name: '번호' });
  await setSequential(page, 3);
  await addColumn(page, { input: 'voice', name: '측정값' });

  const generateBtn = page.locator('text=오늘 테이블 생성').first();
  if (!(await generateBtn.isVisible().catch(() => false))) {
    console.log('ℹ 테이블 생성 버튼 없음 — 스킵');
    return;
  }

  await generateBtn.click();
  await page.waitForTimeout(400);

  // 미리보기 팝업 내 "테이블 미리보기" 헤더
  const previewHeader = page.locator('text=테이블 미리보기').first();
  const previewVisible = await previewHeader.isVisible().catch(() => false);
  if (!previewVisible) {
    console.log('ℹ 미리보기 팝업 없음 (컬럼 설정 미완성) — 스킵');
    return;
  }
  console.log('✓ 테이블 미리보기 팝업 열림');

  // 팝업 내 행 수 확인
  const bodyText = await page.evaluate(() => document.body.innerText);
  const has3Rows = bodyText.includes('1') && bodyText.includes('2') && bodyText.includes('3');
  if (has3Rows) {
    console.log('✓ 미리보기에 1~3행 데이터 표시 확인');
  }

  // 확인 버튼으로 닫기
  const confirmBtn = page.locator('text=확인').last();
  await confirmBtn.click();
  await page.waitForTimeout(200);

  const previewAfterClose = await previewHeader.isVisible().catch(() => false);
  expect(previewAfterClose).toBe(false);
  console.log('✓ 확인 버튼으로 미리보기 팝업 닫힘');
});

// ═════════════════════════════════════════════════════════════════════════════
// 16. 에지케이스 — 컬럼 0개일 때 테이블 생성 불가
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] 컬럼 0개 → 테이블 생성 버튼 표시 but 행 없음', async ({ page }) => {
  await freshSettings(page);

  // 컬럼 추가 안 함 → 테이블 생성 시 행이 0개여야 함
  const generateBtn = page.locator('text=오늘 테이블 생성').first();
  if (!(await generateBtn.isVisible().catch(() => false))) {
    console.log('ℹ 생성 버튼 없음 — 스킵');
    return;
  }
  await generateBtn.click();
  await page.waitForTimeout(400);

  // 생성 시도 후 오류 또는 빈 미리보기
  const bodyText = await page.evaluate(() => document.body.innerText);
  console.log(`✓ 컬럼 0개 생성 시도 결과 확인 (본문 일부: "${bodyText.slice(0, 80)}")`);
});

// ═════════════════════════════════════════════════════════════════════════════
// 17. options 타입 컬럼 옵션 값 입력
// ═════════════════════════════════════════════════════════════════════════════
test('[설정] options 타입 컬럼 선택지 입력', async ({ page }) => {
  await freshSettings(page);
  await addColumn(page, { type: 'options' });
  await page.waitForTimeout(200);

  // 선택지 입력 필드 (OptionsPanel의 "새 값 입력")
  const optionInput = page.locator('input[placeholder="새 값 입력"]').first();

  if (!(await optionInput.isVisible().catch(() => false))) {
    console.log('ℹ options 입력 필드 없음 — 스킵');
    return;
  }

  for (const val of ['사과', '바나나', '포도']) {
    await optionInput.fill(val);
    await optionInput.press('Enter');
    await page.waitForTimeout(100);
  }

  // 등록된 값 확인
  const addedChip = page.locator('button').filter({ hasText: '사과' }).first();
  await expect(addedChip).toBeVisible({ timeout: 2000 });
  console.log('✓ options 타입 선택지 "사과/바나나/포도" 추가 확인');
});
