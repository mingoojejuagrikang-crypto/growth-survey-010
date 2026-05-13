# growth-survey-010

음성 입력 기반 현장 측정 기록 PWA. 이어폰을 끼고 양손이 자유롭지 않은 상태에서
TTS 안내와 음성 인식만으로 측정값을 Google Sheets에 기록합니다.

## 기능

- **설정**: Google OAuth 로그인 → 스프레드시트 URL 붙여넣기 → 컬럼 자동 분석 → 데이터형/입력방식 설정 → 오늘 테이블 생성
- **입력**: 항상 켜진 마이크 + TTS 안내 + 자동 행 진행 + Wake Lock (화면 꺼짐 방지)
- **데이터**: IndexedDB 영속화 + Google Sheets 자동 동기화 + CSV 내보내기

## 음성 명령

| 키워드 | 동작 |
|--------|------|
| 숫자 | 현재 항목에 입력 (한글 수사·아라비아 모두 지원) |
| `수정` 또는 `정정` + 값 | 직전 입력 값 수정 후 다음 항목 진행 |
| `다시`, `재입력` | 현재 항목 재입력 |
| `취소`, `지우기` | 현재 인식값 삭제 후 재입력 대기 |
| `종료`, `끝`, `스톱` | 세션 종료 |

한국어 수사 예시: `삼십오 점 일` → `35.1`, `일점오` → `1.5`, `이천이십육` → `2026`

## 개발

```bash
npm install
cp .env.example .env.local        # VITE_GOOGLE_CLIENT_ID 설정
npm run dev                       # http://localhost:5173
npm run build                     # 프로덕션 빌드
npm run deploy                    # GitHub Pages 배포
```

## 테스트

```bash
npx tsx scripts/test-koreanNum.mjs     # 한글 수사 파서 27 케이스
npx tsx scripts/test-autoValue.mjs     # 테이블 생성 로직 7 케이스
```

## Google Cloud Console 설정

1. `ai-agent-team-493400` 프로젝트 선택 → `API 및 서비스` → `사용자 인증 정보`
2. `OAuth 2.0 클라이언트 ID 만들기` → 애플리케이션 유형: **웹 애플리케이션**
3. 승인된 JavaScript 원본:
   - `http://localhost:5173`
   - `https://mingoojejuagrikang-crypto.github.io`
4. `Google Sheets API` 활성화 (`API 라이브러리` → 검색)
5. 발급된 Client ID를 `.env.local`의 `VITE_GOOGLE_CLIENT_ID`에 저장

## 사용법

1. 스마트폰 Chrome에서 https://mingoojejuagrikang-crypto.github.io/growth-survey-010/ 접속
2. 홈 화면에 추가 (PWA 설치)
3. 설정 탭 → Google 로그인 → 스프레드시트 URL 붙여넣기
4. 컬럼 카드에서 각 항목의 데이터형/입력방식 조정
5. `오늘 테이블 생성` 클릭
6. 입력 탭 → 이어폰 착용 → `음성 입력 시작`
7. TTS 안내 → 값 음성 입력 → 자동 진행

## 디렉토리

```
src/
├── tokens.ts             # 디자인 토큰 (색상, 폰트)
├── types.ts              # Column, Session 등 타입
├── App.tsx               # 탭 라우팅 + 디바이스 프레임
├── components/           # TabBar, MicWave, Chip, Icons
├── screens/              # SettingsScreen, VoiceScreen, DataScreen
├── stores/               # Zustand (settings / session / data)
├── lib/
│   ├── koreanNum.ts      # 한글 수사 → 숫자 파서
│   ├── speech.ts         # SpeechController + TTS
│   ├── useVoiceSession.ts# 세션 오케스트레이션
│   ├── googleAuth.ts     # GIS OAuth
│   ├── sheets.ts         # Sheets API
│   ├── db.ts             # IndexedDB
│   ├── sync.ts           # 동기화 워크플로우
│   ├── csv.ts            # CSV 내보내기
│   ├── autoValue.ts      # 순차 증가 + 중첩 카르테시안
│   └── wakeLock.ts       # 화면 잠금 방지
└── styles/global.css     # @keyframes + 폰트
```
