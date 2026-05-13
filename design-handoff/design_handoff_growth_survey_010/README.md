# Handoff: growth-survey-010

> 야외 현장 연구원을 위한 음성 기반 측정 입력 모바일 PWA

## 개요 (Overview)

**growth-survey-010**은 야외에서 작업하는 현장 연구원이 이어폰만으로 측정 데이터를 입력할 수 있도록 만든 모바일 PWA입니다. 사용자는 녹음 세션 동안 휴대전화를 보거나 만지지 않습니다 — 모든 안내는 TTS 음성으로, 모든 입력은 음성 인식으로 처리됩니다.

핵심 사용 시나리오: 연구원이 한 손에 측정 도구(예: 캘리퍼스), 한 손에 측정 대상(예: 나무 가지)을 잡은 상태로 음성으로만 데이터를 기록합니다.

---

## 디자인 파일에 대해 (About the Design Files)

본 핸드오프에 포함된 파일들은 **HTML로 만들어진 디자인 참고용 프로토타입**입니다. 의도된 외형, 인터랙션, 상태 전이를 시각화한 것이며 **그대로 프로덕션에 복사해 쓸 코드가 아닙니다.**

개발 시 다음 중 하나를 진행하세요:
- 기존 코드베이스가 있다면 → 그 환경(React / Vue / Svelte / 네이티브 등)의 패턴, 컴포넌트 라이브러리, 디자인 시스템을 사용하여 **이 HTML 디자인을 재현**합니다.
- 코드베이스가 아직 없다면 → 프로젝트에 가장 적합한 프레임워크를 선택해 구현합니다. PWA가 목적이므로 **React + Vite + PWA 플러그인** 또는 **Next.js (App Router)**, 음성 기능을 고려하면 **SvelteKit**도 적합한 선택지입니다.

---

## 디자인 충실도 (Fidelity)

**하이파이 (High-fidelity)** — 색상, 타이포그래피, 간격, 인터랙션이 모두 최종에 가깝게 정의되어 있습니다. 픽셀 단위로 재현하시되, 사용 코드베이스의 기존 컴포넌트 라이브러리(예: shadcn/ui, MUI, Tailwind 등)로 시각적으로 동일하게 구현하세요.

---

## 기술 스택 권장사항

- **PWA**: 매니페스트(manifest.webmanifest), 서비스 워커 필수. 오프라인 측정 후 동기화 시나리오가 있으므로 로컬 캐시(IndexedDB) 필수.
- **음성**: 브라우저 Web Speech API
  - `SpeechRecognition` (음성 → 텍스트) — 한국어(`ko-KR`) 설정
  - `SpeechSynthesis` (TTS 응답)
  - 화면 꺼짐 방지: `navigator.wakeLock.request('screen')`
- **Google Sheets 연동**: Google Sheets API v4 + OAuth 2.0 (PKCE 플로우)
- **상태 관리**: 측정 세션 데이터는 IndexedDB 또는 localStorage에 저장, 네트워크 가용 시 Sheets API로 동기화
- **모바일 최적화**: 세로 모드 고정 (`screen.orientation.lock('portrait')`), 화면 항상 켜짐, 다크 테마, 야외 시인성을 위한 고대비

---

## 디바이스 및 레이아웃 제약 (Critical Layout Constraints)

| 속성 | 값 |
|---|---|
| 가로 폭 | **375px 고정** (모바일 portrait) |
| 세로 스크롤 | **모든 탭 내에서 금지** — 컨텐츠는 한 화면에 들어가야 함 |
| 최소 터치 영역 | **48px × 48px** (야외 사용) |
| 하단 탭바 높이 | 88px (홈 인디케이터 28px 포함) |
| 상단 상태바 | 62px (시간 / 배터리) |
| 실 컨텐츠 영역 | 약 662px (812 − 62 − 88) |

---

## 디자인 토큰 (Design Tokens)

### 색상

```css
/* 표면 */
--bg-app:       #0E0F11;  /* 전체 배경 */
--bg-card:      #1A1C1F;  /* 카드 표면 */
--bg-card-alt:  #222428;  /* 입력 필드 / 중첩된 표면 */
--bg-input:     #0F1114;  /* 가장 깊은 입력 배경 */

/* 라인 */
--line:         rgba(255,255,255,0.07);
--line-strong:  rgba(255,255,255,0.13);

/* 텍스트 */
--text:         #F5F5F7;  /* 본문 */
--text-dim:     #A4A8B0;  /* 보조 */
--text-mute:    #6B7079;  /* 레이블 / 캡션 */

/* 강조 */
--blue:         #2979FF;  /* 1차 액션 / 활성 마이크 */
--blue-glow:    rgba(41,121,255,0.32);
--green:        #00C853;  /* 성공 / 동기화 완료 */
--amber:        #FFB300;  /* 부분 동기화 / 경고 */
--red:          #FF5252;  /* REC 표시 */

/* 데이터 타입 색상 */
--type-date:    #7AB8FF;  /* 날짜 */
--type-text:    #C9C9D1;  /* 텍스트 */
--type-int:     #FFB300;  /* 정수 */
--type-float:   #FF9F70;  /* 실수 */
```

### 타이포그래피

- **본문 글꼴**: `Pretendard`, fallback `-apple-system, system-ui, sans-serif`
- **숫자 / 코드 글꼴**: `JetBrains Mono`, fallback `ui-monospace, monospace` (행 번호, 측정값, 날짜 등)
- **글자 잘림 방지**: 전역 `word-break: keep-all;` (한글 단어 단위 줄바꿈)
- **글꼴 굵기**: 400 (보조), 500 (라벨), 600 (이름/버튼), 700 (제목), 800 (큰 숫자)

### 간격

- 컴포넌트 패딩: 4 / 6 / 8 / 10 / 12 / 14 / 16 / 18px 스케일
- 화면 좌우 여백: 16px
- 카드 내부 패딩: 10–14px
- 컴포넌트 간 간격: 4 / 6 / 8 / 12 / 16px

### 모서리 / 그림자

- 카드 / 컨테이너: `border-radius: 12px`
- 큰 버튼: `border-radius: 24–28px` (pill)
- 작은 버튼 / pill: `border-radius: 999px`
- 입력 필드: `border-radius: 8–10px`
- 1차 액션 그림자: `0 4–8px 14–28px rgba(41,121,255,0.32)`

---

## 화면 명세 (Screens)

PWA는 하단에 3개의 탭(설정/입력/데이터)을 가지며, 활성 탭은 파란색 글로우 배경(`38×26px`, `border-radius: 13px`) + 파란색 아이콘으로 표시합니다.

---

### 화면 1: 설정 탭 (`/settings`)

**목적**: Google Sheets 연결, 측정 항목(컬럼) 설정, 오늘의 측정 테이블 생성.

3개의 수직 섹션으로 구성됩니다. **세 섹션 모두 스크롤 없이 한 화면에 들어와야 합니다.**

#### 섹션 1 — Google Sheets 연결 (상단)

카드 컨테이너 (`bg-card`, `border-radius: 14px`, `padding: 10px`):

1. **Google 로그인 버튼** — 높이 48px, 전체 너비
   - 미연결: 회색 배경 (`#2A2D32`), "Google 로그인" + 인증 아이콘
   - 연결됨: 연한 녹색 배경 (`rgba(0,200,83,0.10)`) + 녹색 테두리, "연결됨 · kim@field.kr" + 체크 아이콘
   - **주의**: 실제 구현 시에는 Google 공식 브랜드 가이드(색상 #4285F4, 흰색 G 로고)를 따르세요. 본 프로토타입은 중립적 표현을 사용했습니다.

2. **스프레드시트 URL 입력** — 높이 44px, `border-radius: 10px`, 좌측 link 아이콘
   - 미입력 시 placeholder: "스프레드시트 URL 붙여넣기"
   - 입력/파싱 후: 우측에 녹색 "파싱됨" pill 표시

3. **시트 탭 드롭다운** — URL 파싱 후에만 나타남, 높이 40px
   - 좌측 테이블 아이콘, 우측에 "3개 탭" + chevron-down
   - 클릭 시 시트 내 sheet name 목록 표시

4. **"링크 없이 직접 설정" 토글** — 작은 스위치 (32×18px)
   - 켜면 URL 입력 비활성화, 컬럼을 수동으로만 설정

#### 섹션 2 — 컬럼 카드 리스트 (중앙)

상단에 작은 메타 라인: 좌측 "컬럼 · 6개" (10.5px, weight 700), 우측 "손잡이로 순서 변경" (9.5px, mute).

각 컬럼 카드 (`bg-card`, `border-radius: 12px`, `padding: 5px 8px 5px 2px`):

**Row 1**: `[grip handle] [name input] [type pill]`
- 드래그 핸들: 14px 6-dot 아이콘, 좌측 22px 영역, 커서 grab
- 이름 입력: 14px, weight 600, 인라인 편집 가능 (border-none)
- 타입 pill: 24px 높이, `padding: 0 9px`, 클릭 시 [날짜→텍스트→정수→실수] 순환
  - 날짜: `#7AB8FF` / `rgba(122,184,255,0.13)`
  - 텍스트: `#C9C9D1` / `rgba(201,201,209,0.10)`
  - 정수: `#FFB300` / `rgba(255,179,0,0.13)`
  - 실수: `#FF9F70` / `rgba(255,159,112,0.13)`

**Row 2**: `[3-way toggle] [auto detail (자동 모드일 때만)]`
- 3-way 세그먼트 토글, 높이 24px, `[자동][음성][자동·무음]`
  - 활성: 파란 배경 + 흰 글자
  - 비활성: 투명 + dim 글자
  - 라벨에 `white-space: nowrap` 필수
- "자동" 또는 "자동·무음" 선택 시 우측에 보조 입력:
  - **정수 타입 + 순차 모드**: "순차 [1] ~ [50]" + "고정" 링크
  - **그 외**: "고정값 [...]" + (정수 타입이면 "순차" 링크)
  - 미니 입력: 36–80px 너비, 22px 높이, JetBrains Mono 11px

**리스트 푸터**:
- "+ 항목 추가" 점선 테두리 버튼 (높이 32px, `border: 1px dashed`)

> **표시 제약**: 컬럼이 많을 때 6–8개를 모두 보여주려고 시도하지 마세요. 한 화면에 4개 카드 + 추가 버튼이 들어가도록 컨테이너에 `overflow: hidden` (또는 내부 스크롤)을 적용하고, 더 많은 컬럼은 별도 패널/모달로 표시합니다.

#### 섹션 3 — 액션 바 (하단)

상단에 `border-top: 1px solid rgba(255,255,255,0.07)`, 약간 더 밝은 배경.

- 미생성 상태: **"오늘 테이블 생성"** 1차 액션 버튼 (전체 너비, 높이 48px, `border-radius: 24px`, 파란 배경, 파란 글로우 그림자, 좌측 테이블 아이콘)
- 생성됨 상태: 좌측 "✓ 총 50행 생성됨" 녹색 칩 + 우측 "재생성" 보조 버튼

---

### 화면 2: 입력 탭 (`/voice`) — 3가지 상태

#### 상태 A — 대기 (Ready, 세션 시작 전)

- **중앙 대형 마이크 아이콘**: 168×168px 원형, radial gradient 배경 (subtle), 비활성 회색(`#3A3E45`) 마이크 글리프 76px, 외곽에 두 겹의 옅은 동심원 링.
- **세션 요약 카드** (전체 너비 320px, 패딩 14×18px): 3개 컬럼으로 분할
  - 좌: "오늘 테이블" / "50 행"
  - 중: "항목" / "6 개"
  - 우: "음성" / "4" (파란색)
  - 컬럼 간 1px 세로 디바이더
  - 큰 숫자는 JetBrains Mono, 22px, weight 800
- **안내 문구** (11px, mute, 중앙 정렬): "시작 후 휴대전화를 보거나 만지지 마세요. / 모든 안내는 이어폰 음성으로 진행됩니다."
- **하단 1차 버튼** "🎤 음성 입력 시작" (전체 너비, 높이 60px, `border-radius: 28px`, 파란 배경, 파란 글로우)
  - 테이블 미생성 시 비활성화

#### 상태 B — 활성 녹음

위에서 아래로 4개 영역:

**[1] 상단 진행 바** (패딩 12 18 8)
- 좌측: "행" (11px dim) + 큰 행 번호 (20px mono bold) + "/ 50" (13px mono mute) — 전체에 `white-space: nowrap`
- 우측: 작은 빨간 점 (6px, 펄스 애니메이션) + "REC" (10px red weight 700)
- 진행 바: 높이 4px, `border-radius: 2px`, 회색 트랙 + 파란 채워짐, 파란 글로우 그림자

**[2] 자동 입력값 영역 (화면 높이의 ~20%)**
- 위에 작은 라벨 "자동 입력값" (9px mute uppercase)
- chip 형태로 자동 채워진 값 나열: `[날짜: 2026-05-13] [나무번호: 3] [...]`
  - chip: `padding: 4px 9px`, `border-radius: 999px`, 11px
  - 키 부분은 mute 색, 값 부분은 본문 색 + mono

**[3] 중앙 입력 영역 (화면 높이의 ~40%)**
- 양 옆에 마이크 wave 막대 4개씩 (지속 애니메이션) — "마이크는 항상 켜져 있음" 시각화
  - 막대: 너비 3px, 높이 140px, 색 `rgba(41,121,255,0.5)`, `animation: wave-bar 900ms ease-in-out infinite`, 인덱스마다 130ms 지연
- "다음 입력 항목" 라벨 (11px mute uppercase)
- **항목명 (큰 굵은 한글)**: 44px, weight 800, `letter-spacing: -1.5px`, 파란 글로우 텍스트 그림자
- **펄스 마이크**: 76px 원형
  - radial gradient `#5a9bff → #2979FF → #1755c9`
  - `animation: pulse-mic 1.4s ease-in-out infinite` (scale 1 ↔ 1.08)
  - 외부에 3개의 동심원 ring (`border: 1.5px solid #2979FF`), `animation: ring-expand 2.4s ease-out infinite`, 0/0.8/1.6초 지연으로 시차 있는 펄스 효과
  - 강한 파란 박스 그림자 + 그림자
- **인식된 값**: 56px, weight 800, JetBrains Mono, `letter-spacing: -2px` — 음성으로 인식된 숫자/텍스트가 즉시 표시
  - 미인식 시 dim "—" 표시

**[4] TTS 응답 영역 (화면 높이의 ~20%)**
- 라벨 "TTS 응답" (9px mute)
- 응답 문구 (12px dim italic): `"횡경 18.4, 다음 항목 말씀해 주세요."`

**[5] 하단 컨트롤**
- 좌측 전체너비 "입력 종료" 보조 버튼 (높이 48px, 투명 + 1.5px 테두리)
- 우측 48×48 원형 chevron 버튼 — 다음 항목으로 시뮬레이션 진행(개발 시 제거 가능, 프로토타입 전용)

#### 상태 C — 행 완료 애니메이션 (수백 ms)

- 전체 화면에 짧은 녹색 플래시 (`@keyframes flash-green`, 600ms)
- 진행 바 색이 파랑 → 녹색으로 변경, 우측에 16×16 녹색 체크 마크 원이 `check-pop` 애니메이션으로 등장 (`scale 0 → 1.2 → 1`, 400ms)
- 큰 인식된 값 숫자도 녹색으로 전환 + 녹색 글로우
- ~900ms 후 다음 행(`row + 1`)으로 자동 전환

---

### 화면 3: 데이터 탭 (`/data`)

**목적**: 과거 측정 세션 조회, Google Sheets 동기화, CSV 내보내기.

#### 상단 액션 바

- **"Sheets 동기화"** 1차 버튼 (높이 44px, flex: 1, 파란 배경, `border-radius: 12px`, 좌측 sync 아이콘)
  - 미동기화 세션이 있을 경우 우상단에 amber 카운트 배지 (작은 원, `min-width: 20px`, 흰 배경 테두리)
- **"CSV"** 보조 버튼 (높이 44px, `padding: 0 14px`, 카드 배경 + 테두리)

#### 세션 리스트 (각 카드)

높이 ~56px (확장 시 더 큼), `bg-card`, `border-radius: 12px`:

- **좌측**: 날짜 (13px mono bold, `white-space: nowrap`) + 라벨 부제 (10px mute, 예: "A구역 정밀측정")
- **중앙**: 행 수 칩 (배경 `rgba(255,255,255,0.04)`, `padding: 4px 10px`, `border-radius: 8px`) — 큰 숫자 + 작은 "행"
- **우측**: 동기화 상태 아이콘 + 라벨
  - 완료: 녹색 cloud-check + "동기화됨"
  - 부분: amber cloud + "30/48"
  - 미동기화: mute cloud-off + "미동기화"
- **맨 우측**: chevron-right (확장 시 90도 회전, 180ms transition)

확장된 카드:
- 테두리가 파란색으로 변경 (`rgba(41,121,255,0.4)`)
- 하단에 `border-top` + 0.015 알파 배경의 inline 미니 테이블
- 컬럼: # + 처음 4개 데이터 컬럼명 (9px mute uppercase)
- 행: 4개 샘플 행, 11px mono, `white-space: nowrap` + `text-overflow: ellipsis`
- 자동 입력 컬럼은 dim 색, 음성 입력 컬럼은 본문 색
- 하단에 "… +46행" 인디케이터

#### 빈 상태

- 중앙 정렬, 88×88px 점선 테두리 원형 placeholder + 데이터 아이콘
- "아직 기록된 데이터가 없습니다" (14px dim)
- 부제 "입력 탭에서 음성 세션을 시작하면 / 이곳에 표시됩니다" (11px mute)

---

## 하단 탭바 (Bottom Tab Bar)

- 높이 88px (실제 영역 60px + 홈 인디케이터 클리어런스 28px)
- 배경: `rgba(14,15,17,0.92)` + `backdrop-filter: blur(20px) saturate(160%)`
- 상단 1px 테두리
- 3개 탭: 설정 (settings 아이콘) / 입력 (mic 아이콘) / 데이터 (database 아이콘)
- 활성 표시: 아이콘 위에 38×26px 둥근 배경 (`border-radius: 13px`, `bg: rgba(41,121,255,0.32)`), 200ms transition
- 라벨: 11px, 활성 시 weight 700 + 파란색, 비활성 시 weight 500 + mute
- **모든 탭 버튼은 최소 높이 48px** (터치 영역 확보)

---

## 인터랙션 / 상태 관리 요구사항

### 핵심 상태 (글로벌)

```ts
interface AppState {
  // 인증
  googleConnected: boolean;
  userEmail: string | null;

  // 시트 연결
  sheetUrl: string;
  sheetTab: string;          // 선택된 시트 탭 이름
  availableSheets: string[]; // URL 파싱 결과
  manualMode: boolean;       // 링크 없이 직접 설정

  // 컬럼 정의
  columns: Column[];

  // 오늘 세션
  tableGenerated: boolean;
  todayRows: number;         // 보통 50
  activeRow: number;
  activeColIdx: number;
  recognizedValue: string;

  // 데이터
  sessions: Session[];
  expandedSessionId: string | null;
}

interface Column {
  id: string;
  name: string;
  type: 'date' | 'text' | 'int' | 'float';
  mode: 'auto' | 'voice' | 'silent';     // silent = 자동·무음
  auto: { kind: 'fixed'; value: string }
      | { kind: 'seq'; from: number; to: number };
}

interface Session {
  id: string;
  date: string;             // ISO YYYY-MM-DD
  label: string;            // 예: "A구역 정밀측정"
  rows: number;
  synced: number;           // 동기화된 행 수
  data: Record<string, string>[];
}
```

### 음성 인터랙션 플로우 (Web Speech API)

```
[음성 입력 시작 버튼 클릭]
  └─ wakeLock 획득 + 화면 가로 잠금
  └─ recognition.start() (continuous: true, interimResults: true, lang: 'ko-KR')
  └─ TTS: "1번 행, 횡경 말씀해 주세요"
  └─ 사용자 발화 → onresult → 정규화 → state.recognizedValue
  └─ TTS echo: "횡경 18.4, 다음 항목 말씀해 주세요"
  └─ 다음 컬럼으로 activeColIdx++
  └─ 모든 컬럼 완료 → state C 애니메이션 → activeRow++
  └─ 마지막 행까지 도달 → TTS: "측정 완료" → 종료
```

특수 음성 명령:
- "취소" / "지우기" → 마지막 값 삭제
- "다시" → 마지막 값 재입력
- "종료" → 세션 종료

### 데이터 타입별 음성 파싱

- **정수**: "삼" → 3, "열" → 10, "이십" → 20 등 한글 수사 처리
- **실수**: "십팔 점 사" → 18.4, "이점삼" → 2.3
- **날짜**: 보통 자동·무음, 음성 시 "이천이십육년 오월 십삼일" 파싱
- **텍스트**: raw transcript

### 애니메이션 정의 (CSS keyframes)

```css
@keyframes pulse-mic        /* 마이크 펄스 1.4s */
@keyframes ring-expand      /* 동심원 확장 2.4s */
@keyframes wave-bar         /* 좌우 음파 막대 900ms */
@keyframes flash-green      /* 행 완료 플래시 600ms */
@keyframes check-pop        /* 체크 등장 400ms */
@keyframes fade-up          /* 카드 확장 페이드 200ms */
```

이징: 모두 `ease-out` 또는 `ease-in-out`.

### Google Sheets 동기화 전략

1. 측정값은 항상 IndexedDB에 먼저 저장 (오프라인 우선)
2. 네트워크 가용 시 batch update (Sheets API: `spreadsheets.values.batchUpdate`)
3. 충돌 시 로컬 우선 + 사용자에게 경고
4. 동기화 진행 상태를 세션 카드의 `synced` 카운터에 반영
5. 백그라운드 sync (Background Sync API)로 앱 미사용 시에도 시도

---

## 접근성 / 야외 사용 고려사항

- **고대비 다크 테마** — `#0E0F11` 배경 + `#F5F5F7` 텍스트 (콘트라스트 비 > 13:1)
- **큰 글꼴** — 본문 12–14px, 입력값 56px, 헤딩 22–44px
- **48px 최소 터치 영역** — 모든 버튼, 탭, 카드 헤더
- **글러브 / 햇빛 친화적** — 다이얼/슬라이더보다 큰 버튼 위주
- **화면 항상 켜짐** — `wakeLock` API
- **세로 잠금** — `screen.orientation.lock('portrait')`
- **PWA 매니페스트**: `display: standalone`, `orientation: portrait`, theme/background `#0E0F11`

---

## 핸드오프에 포함된 파일

```
design_handoff_growth_survey_010/
├── README.md           ← 이 문서
├── index.html          ← 진입점, React + Babel + 외부 폰트
├── app.jsx             ← 메인 App: 상태, 디바이스 프레임, Tweaks 패널
├── shared.jsx          ← 디자인 토큰 (T), 아이콘 (I), TabBar, MicWave, Chip
├── settings.jsx        ← 설정 탭 (3 섹션)
├── voice.jsx           ← 입력 탭 (상태 A/B/C)
├── data.jsx            ← 데이터 탭 (세션 리스트 + 확장)
├── ios-frame.jsx       ← iPhone 디바이스 프레임 (참고용)
└── tweaks-panel.jsx    ← 디자인 검토용 Tweaks 패널 (참고용, 프로덕션 불필요)
```

`ios-frame.jsx`와 `tweaks-panel.jsx`는 디자인 검토/프레젠테이션용입니다. 실제 PWA 구현 시에는 제외하세요.

브라우저에서 `index.html`을 열면 모든 화면과 상태를 인터랙티브하게 확인할 수 있습니다. 우상단 **Tweaks** 토글로 탭과 상태를 전환하세요.

---

## 구현 시 우선순위

1. **Phase 1 — 정적 UI**: 3개 탭과 모든 상태를 React 컴포넌트로 구현 (음성 미연동), 로컬 모킹 데이터로 시각 확인
2. **Phase 2 — PWA 셸**: 서비스 워커, 매니페스트, wakeLock, 세로 잠금
3. **Phase 3 — 음성**: Web Speech API 연동, 한글 수사 파서, TTS 응답
4. **Phase 4 — Google Sheets**: OAuth, 시트 파싱, 테이블 생성, batch sync
5. **Phase 5 — 오프라인**: IndexedDB 저장소, Background Sync, 충돌 처리

---

## 문의사항이 있다면

이 디자인의 의도에 대해 질문이 있다면 디자인 파일들의 인터랙티브 프로토타입(index.html)을 먼저 살펴보세요 — 대부분의 인터랙션과 마이크로 애니메이션이 거기 들어있습니다.
