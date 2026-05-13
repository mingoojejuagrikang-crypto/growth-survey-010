// Settings tab — Google Sheets / Column config / Action bar
// All three sections fit in the available 638px viewport.

function GoogleConnectSection({ state, set }) {
  const connected = state.googleConnected;
  return (
    <div style={{ padding: '0 16px' }}>
      <div style={{
        background: T.card, borderRadius: 14, padding: 10,
        border: `1px solid ${T.line}`,
        display: 'flex', flexDirection: 'column', gap: 8,
      }}>
        {/* Google login button */}
        <button onClick={() => set({ googleConnected: !connected })}
          style={{
            height: 48, borderRadius: 12,
            border: `1px solid ${connected ? 'rgba(0,200,83,0.35)' : T.lineStrong}`,
            background: connected ? 'rgba(0,200,83,0.10)' : '#2A2D32',
            color: T.text, fontSize: 14, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: 'pointer', letterSpacing: -0.2,
          }}>
          <AuthMark s={18} />
          {connected
            ? <>연결됨 · <span style={{ color: T.textDim, fontWeight: 500 }}>kim@field.kr</span></>
            : <>Google 로그인</>}
          {connected && I.check(16, T.green)}
        </button>

        {/* URL input + dropdown row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <div style={{
            flex: 1, height: 44, borderRadius: 10,
            background: '#0F1114', border: `1px solid ${T.line}`,
            display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
          }}>
            <div style={{ color: T.textMute }}>{I.link(14)}</div>
            <div style={{
              flex: 1, fontSize: 12, color: state.sheetUrl ? T.text : T.textMute,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            }}>
              {state.sheetUrl || '스프레드시트 URL 붙여넣기'}
            </div>
            {state.sheetUrl && (
              <Chip color={T.green} bg="rgba(0,200,83,0.13)" strong>파싱됨</Chip>
            )}
          </div>
        </div>

        {/* Sheet tab dropdown — only after URL parsed */}
        {state.sheetUrl && (
          <div style={{
            height: 40, borderRadius: 10, background: '#0F1114',
            border: `1px solid ${T.line}`,
            display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8,
            fontSize: 13, color: T.text,
          }}>
            <div style={{ color: T.textMute }}>{I.table(14)}</div>
            <span style={{ flex: 1, fontWeight: 500 }}>{state.sheetTab}</span>
            <span style={{ color: T.textMute, fontSize: 11 }}>3개 탭</span>
            <span style={{ color: T.textDim }}>{I.chevDown(14)}</span>
          </div>
        )}

        {/* Toggle: 링크 없이 직접 설정 */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          paddingTop: 2,
        }}>
          <span style={{ fontSize: 12, color: T.textDim, letterSpacing: -0.1 }}>
            링크 없이 직접 설정
          </span>
          <ToggleSwitch on={state.manualMode} onChange={v => set({ manualMode: v })} />
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ on, onChange, size = 'sm' }) {
  const W = size === 'sm' ? 32 : 40;
  const H = size === 'sm' ? 18 : 22;
  const D = H - 4;
  return (
    <button onClick={() => onChange(!on)} style={{
      width: W, height: H, borderRadius: 999, border: 'none',
      background: on ? T.blue : 'rgba(255,255,255,0.13)',
      position: 'relative', cursor: 'pointer', padding: 0,
      transition: 'background 180ms',
    }}>
      <div style={{
        position: 'absolute', top: 2, left: on ? W - D - 2 : 2,
        width: D, height: D, borderRadius: '50%', background: '#fff',
        transition: 'left 180ms',
        boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
      }}/>
    </button>
  );
}

// ─── Column card ───────────────────────────────────────────────
function ColumnCard({ col, onChange, onRemove }) {
  const typ = TYPE_COLORS[col.type];
  return (
    <div style={{
      background: T.card, borderRadius: 12,
      border: `1px solid ${T.line}`,
      padding: '5px 8px 5px 2px',
      display: 'flex', flexDirection: 'column', gap: 3,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {/* drag handle */}
        <div style={{
          width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.textMute, cursor: 'grab',
        }}>{I.grip(14)}</div>

        {/* name */}
        <input
          value={col.name}
          onChange={e => onChange({ ...col, name: e.target.value })}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: T.text, fontSize: 14, fontWeight: 600, outline: 'none',
            letterSpacing: -0.2, padding: '2px 2px', minWidth: 0,
          }}
        />

        {/* type pill */}
        <button style={{
          height: 22, borderRadius: 999, padding: '0 8px',
          border: 'none', background: typ.bg, color: typ.fg,
          fontSize: 10.5, fontWeight: 700, letterSpacing: 0.1,
          display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
        }}
        onClick={() => {
          const order = ['date', 'text', 'int', 'float'];
          const next = order[(order.indexOf(col.type) + 1) % order.length];
          onChange({ ...col, type: next });
        }}>
          {TYPE_LABELS[col.type]} {I.chevDown(10, typ.fg)}
        </button>
      </div>

      {/* 3-way toggle + (auto detail) */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26 }}>
        <ThreeWay
          value={col.mode}
          onChange={v => onChange({ ...col, mode: v })}
        />
        {col.mode !== 'voice' && (
          <AutoDetail col={col} onChange={onChange} />
        )}
      </div>
    </div>
  );
}

function ThreeWay({ value, onChange }) {
  const opts = [
    { id: 'auto',    label: '자동' },
    { id: 'voice',   label: '음성' },
    { id: 'silent',  label: '자동·무음' },
  ];
  return (
    <div style={{
      display: 'inline-flex', background: '#0F1114', borderRadius: 7,
      padding: 2, border: `1px solid ${T.line}`, height: 24,
    }}>
      {opts.map(o => {
        const active = value === o.id;
        return (
          <button key={o.id} onClick={() => onChange(o.id)} style={{
            border: 'none', background: active ? T.blue : 'transparent',
            color: active ? '#fff' : T.textDim,
            fontSize: 10.5, fontWeight: active ? 700 : 600,
            padding: '0 8px', borderRadius: 6, cursor: 'pointer',
            letterSpacing: -0.1, height: '100%',
            whiteSpace: 'nowrap',
          }}>{o.label}</button>
        );
      })}
    </div>
  );
}

function AutoDetail({ col, onChange }) {
  // Auto modes: either fixed value or sequential N~M depending on data type
  const isInt = col.type === 'int';
  if (isInt && col.auto?.kind === 'seq') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        <span style={{ fontSize: 10, color: T.textMute, letterSpacing: -0.1 }}>순차</span>
        <MiniInput value={col.auto.from} onChange={v => onChange({ ...col, auto: { ...col.auto, from: v } })} />
        <span style={{ color: T.textMute, fontSize: 11 }}>~</span>
        <MiniInput value={col.auto.to} onChange={v => onChange({ ...col, auto: { ...col.auto, to: v } })} />
        <button onClick={() => onChange({ ...col, auto: { kind: 'fixed', value: '' } })} style={{
          border: 'none', background: 'transparent', color: T.textMute, fontSize: 10,
          cursor: 'pointer', textDecoration: 'underline',
        }}>고정</button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 10, color: T.textMute, letterSpacing: -0.1 }}>고정값</span>
      <MiniInput
        value={col.auto?.value ?? ''}
        placeholder={col.type === 'date' ? '오늘' : col.type === 'int' ? '0' : '값'}
        onChange={v => onChange({ ...col, auto: { kind: 'fixed', value: v } })}
        wide
      />
      {col.type === 'int' && (
        <button onClick={() => onChange({ ...col, auto: { kind: 'seq', from: 1, to: 50 } })} style={{
          border: 'none', background: 'transparent', color: T.blue, fontSize: 10,
          cursor: 'pointer', fontWeight: 600,
        }}>순차</button>
      )}
    </div>
  );
}

function MiniInput({ value, onChange, placeholder, wide }) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: wide ? 80 : 36, height: 22, borderRadius: 6,
        background: '#0F1114', border: `1px solid ${T.line}`,
        color: T.text, fontSize: 11, fontWeight: 600,
        textAlign: 'center', outline: 'none', padding: '0 4px',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      }}
    />
  );
}

// ─── Settings tab root ────────────────────────────────────────
function SettingsTab({ state, set }) {
  const { columns } = state;
  const updateCol = (idx, next) => {
    const copy = [...columns];
    copy[idx] = next;
    set({ columns: copy });
  };
  const addCol = () => {
    set({ columns: [...columns, {
      id: 'c' + Date.now(),
      name: '새 항목', type: 'text', mode: 'voice', auto: { kind: 'fixed', value: '' },
    }] });
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', height: '100%',
      paddingTop: 0,
    }}>
      <ScreenHeader
        title="설정"
        sub="오늘의 측정 항목과 시트 연결"
      />

      {/* Section 1 — Google */}
      <GoogleConnectSection state={state} set={set} />

      {/* Section 2 — Column list */}
      <div style={{
        marginTop: 10, paddingLeft: 16, paddingRight: 16,
        display: 'flex', flexDirection: 'column', gap: 4,
        flex: 1, minHeight: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0 4px',
        }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textDim, letterSpacing: 0.6 }}>
            컬럼 · {columns.length}개
          </span>
          <span style={{ fontSize: 9.5, color: T.textMute, letterSpacing: -0.1, whiteSpace: 'nowrap' }}>
            손잡이로 순서 변경
          </span>
        </div>

        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          flex: 1, minHeight: 0, overflow: 'hidden',
        }}>
          {columns.slice(0, 4).map((c, i) => (
            <ColumnCard key={c.id} col={c}
              onChange={n => updateCol(i, n)}
              onRemove={() => set({ columns: columns.filter((_, j) => j !== i) })} />
          ))}

          <button onClick={addCol} style={{
            height: 32, borderRadius: 10,
            background: 'transparent', border: `1px dashed ${T.lineStrong}`,
            color: T.textDim, fontSize: 11.5, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            cursor: 'pointer', flexShrink: 0,
          }}>
            {I.plus(13, T.textDim)} 항목 추가
          </button>
        </div>
      </div>

      {/* Section 3 — Action bar */}
      <div style={{
        padding: '8px 16px 10px', borderTop: `1px solid ${T.line}`,
        background: 'rgba(255,255,255,0.015)',
        display: 'flex', alignItems: 'center', gap: 10, marginTop: 8,
      }}>
        {state.tableGenerated ? (
          <>
            <div style={{
              flex: 1, height: 48, borderRadius: 24,
              background: 'rgba(0,200,83,0.12)',
              border: '1px solid rgba(0,200,83,0.35)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              fontSize: 13, fontWeight: 700, color: T.green,
            }}>
              {I.check(16, T.green)} 총 50행 생성됨
            </div>
            <button onClick={() => set({ tableGenerated: false })} style={{
              height: 48, padding: '0 14px', borderRadius: 24,
              border: `1px solid ${T.lineStrong}`, background: 'transparent',
              color: T.textDim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>재생성</button>
          </>
        ) : (
          <button onClick={() => set({ tableGenerated: true })} style={{
            flex: 1, height: 48, borderRadius: 24, border: 'none',
            background: T.blue, color: '#fff',
            fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer',
            boxShadow: `0 6px 18px ${T.blueGlow}`,
          }}>
            {I.table(16, '#fff')} 오늘 테이블 생성
          </button>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { SettingsTab });
