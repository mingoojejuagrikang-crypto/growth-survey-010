// growth-survey-010 — main app
// Renders the iOS phone frame (375x812) + screens + bottom tab bar + Tweaks.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "initialTab": "settings",
  "initialVoiceState": "active",
  "googleConnected": true,
  "tableGenerated": true,
  "showFrame": true,
  "showBackdrop": true
}/*EDITMODE-END*/;

const SAMPLE_COLUMNS = [
  { id: 'c1', name: '날짜',     type: 'date',  mode: 'silent', auto: { kind: 'fixed', value: '오늘' } },
  { id: 'c2', name: '나무번호', type: 'int',   mode: 'silent', auto: { kind: 'seq',  from: 1, to: 50 } },
  { id: 'c3', name: '횡경',     type: 'float', mode: 'voice',  auto: { kind: 'fixed', value: '' } },
  { id: 'c4', name: '수고',     type: 'float', mode: 'voice',  auto: { kind: 'fixed', value: '' } },
  { id: 'c5', name: '과실수',   type: 'int',   mode: 'voice',  auto: { kind: 'fixed', value: '' } },
  { id: 'c6', name: '비고',     type: 'text',  mode: 'voice',  auto: { kind: 'fixed', value: '' } },
];

const SAMPLE_SESSIONS = [
  { id: 's1', date: '2026-05-13', label: '오늘 · 진행중',  rows: 12, synced: 0  },
  { id: 's2', date: '2026-05-12', label: 'A구역 정밀측정', rows: 50, synced: 50 },
  { id: 's3', date: '2026-05-11', label: 'B구역 표본',     rows: 48, synced: 30 },
  { id: 's4', date: '2026-05-08', label: '신규 식재 확인', rows: 22, synced: 22 },
];

function App() {
  const [tweaks, setTweak] = useTweaks(TWEAK_DEFAULTS);

  // app state
  const [tab, setTab] = React.useState(tweaks.initialTab);
  const [voiceState, setVoiceState] = React.useState(tweaks.initialVoiceState);
  const [state, setState] = React.useState({
    googleConnected: tweaks.googleConnected,
    sheetUrl: tweaks.googleConnected ? 'docs.google.com/.../1xK_growth_010' : '',
    sheetTab: '2026년 5월 측정',
    manualMode: false,
    tableGenerated: tweaks.tableGenerated,
    columns: SAMPLE_COLUMNS,
    activeRow: 3,
    activeColIdx: 2, // 횡경
    recognizedValue: '18.4',
    sessions: SAMPLE_SESSIONS,
    expandedSessionId: 's2',
  });
  const set = (patch) => setState(prev => ({ ...prev, ...patch }));

  // Reflect tweak changes into app state where meaningful
  React.useEffect(() => { setTab(tweaks.initialTab); }, [tweaks.initialTab]);
  React.useEffect(() => { setVoiceState(tweaks.initialVoiceState); }, [tweaks.initialVoiceState]);
  React.useEffect(() => { set({ googleConnected: tweaks.googleConnected, sheetUrl: tweaks.googleConnected ? 'docs.google.com/.../1xK_growth_010' : '' }); }, [tweaks.googleConnected]);
  React.useEffect(() => { set({ tableGenerated: tweaks.tableGenerated }); }, [tweaks.tableGenerated]);

  // Auto-advance the recognized value loop when active (simulation)
  React.useEffect(() => {
    if (voiceState !== 'active') return;
    const values = ['18.4', '21.1', '14.7', '19.9'];
    let i = 0;
    const id = setInterval(() => {
      i = (i + 1) % values.length;
      set({ recognizedValue: values[i] });
    }, 2200);
    return () => clearInterval(id);
  }, [voiceState]);

  // ─── Screen content ─────────────────────────────────────────
  const screen = (
    <div style={{
      width: '100%', height: '100%',
      display: 'flex', flexDirection: 'column',
      background: T.bg, color: T.text,
      paddingTop: 62, // status bar area
    }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {tab === 'settings' && <SettingsTab state={state} set={set} />}
        {tab === 'voice' && (
          <VoiceTab state={state} set={set}
            voiceState={voiceState} setVoiceState={setVoiceState}/>
        )}
        {tab === 'data' && <DataTab state={state} set={set} />}
      </div>
      <TabBar tab={tab} setTab={setTab} />
    </div>
  );

  // ─── Device frame ───────────────────────────────────────────
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 60,
      flexWrap: 'wrap', justifyContent: 'center',
    }}>
      {tweaks.showFrame ? (
        <IOSDevice width={375} height={812} dark={true}>
          {screen}
        </IOSDevice>
      ) : (
        <div style={{
          width: 375, height: 812, borderRadius: 32,
          overflow: 'hidden', background: T.bg,
          boxShadow: '0 40px 80px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.06)',
        }}>{screen}</div>
      )}

      <TweaksPanel title="Tweaks">
        <TweakSection label="시작 화면">
          <TweakRadio
            label="탭"
            value={tweaks.initialTab}
            options={[
              { value: 'settings', label: '설정' },
              { value: 'voice',    label: '입력' },
              { value: 'data',     label: '데이터' },
            ]}
            onChange={v => setTweak('initialTab', v)}
          />
          <TweakRadio
            label="음성 상태"
            value={tweaks.initialVoiceState}
            options={[
              { value: 'ready',    label: 'A · 대기' },
              { value: 'active',   label: 'B · 녹음' },
              { value: 'complete', label: 'C · 완료' },
            ]}
            onChange={v => setTweak('initialVoiceState', v)}
          />
        </TweakSection>
        <TweakSection label="상태">
          <TweakToggle label="Google 연결됨" value={tweaks.googleConnected}
            onChange={v => setTweak('googleConnected', v)}/>
          <TweakToggle label="테이블 생성됨" value={tweaks.tableGenerated}
            onChange={v => setTweak('tableGenerated', v)}/>
        </TweakSection>
        <TweakSection label="프레임">
          <TweakToggle label="iPhone 프레임" value={tweaks.showFrame}
            onChange={v => setTweak('showFrame', v)}/>
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App/>);
