// Voice Input tab — states A (ready), B (active), C (row complete)

function VoiceTab({ state, set, voiceState, setVoiceState }) {
  // voiceState: 'ready' | 'active' | 'complete'
  // active row simulation
  const row = state.activeRow;
  const totalRows = state.tableGenerated ? 50 : 0;
  const columns = state.columns;
  const currentColIdx = state.activeColIdx;
  const currentCol = columns[currentColIdx] || columns[0];
  const autoChips = columns
    .filter(c => c.mode !== 'voice')
    .slice(0, 3)
    .map(c => ({ name: c.name, value: autoValue(c, row) }));

  return (
    <div style={{
      position: 'relative', height: '100%',
      display: 'flex', flexDirection: 'column',
      animation: voiceState === 'complete' ? 'flash-green 600ms ease-out' : 'none',
    }}>
      {voiceState === 'ready' && <ReadyState state={state} set={set} setVoiceState={setVoiceState} />}
      {voiceState === 'active' && (
        <ActiveState
          state={state} set={set} setVoiceState={setVoiceState}
          row={row} totalRows={totalRows}
          autoChips={autoChips}
          currentCol={currentCol}
        />
      )}
      {voiceState === 'complete' && (
        <ActiveState
          state={state} set={set} setVoiceState={setVoiceState}
          row={row} totalRows={totalRows}
          autoChips={autoChips}
          currentCol={currentCol}
          completing
        />
      )}
    </div>
  );
}

// auto-fill simulator
function autoValue(col, row) {
  if (col.auto?.kind === 'seq') {
    const from = parseInt(col.auto.from) || 1;
    return String(from + row - 1);
  }
  if (col.type === 'date') return '2026-05-13';
  if (col.auto?.value) return col.auto.value;
  return col.type === 'int' ? '0' : '—';
}

// ─── STATE A: READY ───────────────────────────────────────────
function ReadyState({ state, set, setVoiceState }) {
  const ready = state.tableGenerated;
  const voiceCount = state.columns.filter(c => c.mode === 'voice').length;

  return (
    <>
      <ScreenHeader
        title="음성 입력"
        sub={ready ? '이어폰을 끼고 시작하세요' : '먼저 테이블을 생성하세요'}
      />

      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '0 24px',
        gap: 24,
      }}>
        {/* big inactive mic */}
        <div style={{ position: 'relative' }}>
          <div style={{
            width: 168, height: 168, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 70%, transparent)',
            border: `1px solid ${T.line}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textMute,
          }}>
            {I.micFilled(76, '#3A3E45')}
          </div>
          {/* concentric rings */}
          {[0, 1].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: -16 - i * 12, borderRadius: '50%',
              border: `1px solid rgba(255,255,255,${0.05 - i * 0.02})`,
            }}/>
          ))}
        </div>

        {/* session summary */}
        <div style={{
          background: T.card, border: `1px solid ${T.line}`,
          borderRadius: 14, padding: '14px 18px',
          display: 'flex', alignItems: 'center', gap: 18,
          width: '100%', maxWidth: 320,
        }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: 0.7 }}>
              오늘 테이블
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 2, letterSpacing: -0.6, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {state.tableGenerated ? 50 : 0}<span style={{ fontSize: 12, color: T.textDim, fontWeight: 500, marginLeft: 4 }}>행</span>
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.line }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: 0.7 }}>
              항목
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.text, marginTop: 2, letterSpacing: -0.6, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {state.columns.length}<span style={{ fontSize: 12, color: T.textDim, fontWeight: 500, marginLeft: 4 }}>개</span>
            </div>
          </div>
          <div style={{ width: 1, height: 32, background: T.line }}/>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: 0.7 }}>
              음성
            </div>
            <div style={{ fontSize: 22, fontWeight: 800, color: T.blue, marginTop: 2, letterSpacing: -0.6, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              {voiceCount}
            </div>
          </div>
        </div>

        <div style={{ fontSize: 11, color: T.textMute, textAlign: 'center', lineHeight: 1.5, maxWidth: 280 }}>
          시작 후 휴대전화를 보거나 만지지 마세요.<br/>
          모든 안내는 이어폰 음성으로 진행됩니다.
        </div>
      </div>

      {/* primary start button */}
      <div style={{ padding: '0 16px 12px' }}>
        <button
          disabled={!ready}
          onClick={() => { set({ activeRow: 1, activeColIdx: 0 }); setVoiceState('active'); }}
          style={{
            width: '100%', height: 60, borderRadius: 28, border: 'none',
            background: ready ? T.blue : '#2A2D32',
            color: ready ? '#fff' : T.textMute,
            fontSize: 17, fontWeight: 800, letterSpacing: -0.3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: ready ? `0 8px 28px ${T.blueGlow}` : 'none',
          }}>
          {I.mic(22, ready ? '#fff' : T.textMute)} 음성 입력 시작
        </button>
      </div>
    </>
  );
}

// ─── STATE B: ACTIVE ──────────────────────────────────────────
function ActiveState({ state, set, setVoiceState, row, totalRows, autoChips, currentCol, completing = false }) {
  const pct = (row / totalRows) * 100;

  const advance = () => {
    if (state.activeColIdx < state.columns.length - 1) {
      set({ activeColIdx: state.activeColIdx + 1 });
    } else {
      // row complete — trigger animation
      setVoiceState('complete');
      setTimeout(() => {
        if (row >= totalRows) {
          setVoiceState('ready');
          set({ activeRow: 1, activeColIdx: 0 });
        } else {
          set({ activeRow: row + 1, activeColIdx: 0 });
          setVoiceState('active');
        }
      }, 900);
    }
  };

  return (
    <>
      {/* Top progress bar */}
      <div style={{ padding: '12px 18px 8px' }}>
        <div style={{
          display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          marginBottom: 6,
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap' }}>
            <span style={{ fontSize: 11, color: T.textDim, fontWeight: 600, letterSpacing: 0.5 }}>행</span>
            <span style={{ fontSize: 20, fontWeight: 800, color: T.text, fontFamily: 'JetBrains Mono, ui-monospace, monospace', letterSpacing: -0.5 }}>
              {row}
            </span>
            <span style={{ fontSize: 13, color: T.textMute, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
              / {totalRows}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{
              width: 6, height: 6, borderRadius: '50%', background: T.red,
              animation: 'pulse-mic 1.2s ease-in-out infinite',
            }}/>
            <span style={{ fontSize: 10, color: T.red, fontWeight: 700, letterSpacing: 0.7 }}>
              REC
            </span>
          </div>
        </div>
        <div style={{ position: 'relative', height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.08)' }}>
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
            width: `${pct}%`, background: completing ? T.green : T.blue,
            transition: 'width 400ms ease-out, background 200ms',
            boxShadow: completing ? `0 0 12px ${T.green}` : `0 0 8px ${T.blueGlow}`,
          }}/>
          {completing && (
            <div style={{
              position: 'absolute', right: `${100 - pct}%`, top: -6, width: 16, height: 16,
              borderRadius: '50%', background: T.green, transform: 'translateX(50%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'check-pop 400ms ease-out',
              boxShadow: `0 0 12px ${T.green}`,
            }}>
              {I.check(10, '#fff')}
            </div>
          )}
        </div>
      </div>

      {/* Upper 20% — auto-filled chips */}
      <div style={{
        padding: '6px 14px 8px',
        display: 'flex', flexWrap: 'wrap', gap: 6,
        borderBottom: `1px solid ${T.line}`,
        minHeight: 56, alignContent: 'flex-start',
      }}>
        <span style={{
          fontSize: 9, color: T.textMute, fontWeight: 700, letterSpacing: 0.6,
          width: '100%', marginBottom: 2,
        }}>자동 입력값</span>
        {autoChips.map((c, i) => (
          <Chip key={i} color={T.textDim} bg="rgba(255,255,255,0.05)">
            <span style={{ color: T.textMute }}>{c.name}:</span>
            <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', color: T.text, fontWeight: 600 }}>
              {c.value}
            </span>
          </Chip>
        ))}
      </div>

      {/* Center 40% — current field */}
      <div style={{
        flex: 1, position: 'relative',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '0 24px', gap: 10, minHeight: 0,
      }}>
        {/* side wave bars */}
        <MicWave side="left" tall={140} bars={4} color="rgba(41,121,255,0.5)" />
        <MicWave side="right" tall={140} bars={4} color="rgba(41,121,255,0.5)" />

        <div style={{
          fontSize: 11, color: T.textMute, fontWeight: 700, letterSpacing: 0.8,
        }}>다음 입력 항목</div>

        <div style={{
          fontSize: 44, fontWeight: 800, color: T.text, letterSpacing: -1.5,
          lineHeight: 1, textShadow: `0 0 24px rgba(41,121,255,0.18)`,
        }}>{currentCol?.name}</div>

        {/* pulsing mic */}
        <div style={{ position: 'relative', marginTop: 4 }}>
          {/* expanding rings */}
          {[0, 1, 2].map(i => (
            <div key={i} style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              border: `1.5px solid ${T.blue}`,
              animation: `ring-expand 2.4s ease-out ${i * 0.8}s infinite`,
            }}/>
          ))}
          <div style={{
            width: 76, height: 76, borderRadius: '50%',
            background: `radial-gradient(circle at 30% 30%, #5a9bff, ${T.blue} 60%, #1755c9)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            animation: 'pulse-mic 1.4s ease-in-out infinite',
            boxShadow: `0 0 40px ${T.blueGlow}, 0 8px 24px rgba(0,0,0,0.4)`,
          }}>
            {I.micFilled(36, '#fff')}
          </div>
        </div>

        {/* recognized value */}
        <div style={{
          fontSize: 56, fontWeight: 800, color: completing ? T.green : T.text,
          letterSpacing: -2, lineHeight: 1, marginTop: 6,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          minHeight: 56,
          textShadow: completing ? `0 0 32px rgba(0,200,83,0.4)` : 'none',
        }}>
          {state.recognizedValue || <span style={{ color: T.textMute, opacity: 0.4 }}>—</span>}
        </div>
      </div>

      {/* Status 20% — last TTS echo */}
      <div style={{
        padding: '8px 16px 6px',
        borderTop: `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column', gap: 4,
      }}>
        <div style={{
          fontSize: 9, color: T.textMute, fontWeight: 700, letterSpacing: 0.6,
        }}>TTS 응답</div>
        <div style={{
          fontSize: 12, color: T.textDim, fontWeight: 500,
          fontStyle: 'italic', letterSpacing: -0.1,
        }}>
          “{currentCol?.name} {state.recognizedValue || '...'}, 다음 항목 말씀해 주세요.”
        </div>
      </div>

      {/* Bottom — end button + simulate */}
      <div style={{
        padding: '8px 16px 12px',
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <button onClick={() => { setVoiceState('ready'); }} style={{
          flex: 1, height: 48, borderRadius: 24,
          border: `1.5px solid ${T.lineStrong}`, background: 'transparent',
          color: T.textDim, fontSize: 14, fontWeight: 700, letterSpacing: -0.2,
          cursor: 'pointer',
        }}>입력 종료</button>
        <button onClick={advance} style={{
          width: 48, height: 48, borderRadius: 24,
          border: 'none', background: T.blue, color: '#fff',
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: `0 4px 14px ${T.blueGlow}`,
        }} title="시뮬레이트: 다음 항목">
          {I.chevron(20, '#fff')}
        </button>
      </div>
    </>
  );
}

Object.assign(window, { VoiceTab });
