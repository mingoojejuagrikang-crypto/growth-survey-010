// Data tab — session list with sync + export actions

function DataTab({ state, set }) {
  const sessions = state.sessions;
  const empty = sessions.length === 0;
  const unsynced = sessions.filter(s => s.synced < s.rows).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="데이터" sub={`${sessions.length}개 세션`} />

      {/* Top action bar */}
      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8 }}>
        <button onClick={() => set({ sessions: sessions.map(s => ({ ...s, synced: s.rows })) })}
          style={{
            flex: 1, height: 44, borderRadius: 12, border: 'none',
            background: T.blue, color: '#fff',
            fontSize: 13, fontWeight: 700, letterSpacing: -0.2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            cursor: 'pointer', position: 'relative',
            boxShadow: `0 4px 14px ${T.blueGlow}`,
          }}>
          {I.sync(15, '#fff')} Sheets 동기화
          {unsynced > 0 && (
            <span style={{
              position: 'absolute', top: -4, right: -4,
              minWidth: 20, height: 20, padding: '0 6px',
              borderRadius: 999, background: T.amber, color: '#1a1300',
              fontSize: 11, fontWeight: 800, fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: '2px solid #0E0F11',
            }}>{unsynced}</span>
          )}
        </button>
        <button style={{
          height: 44, padding: '0 14px', borderRadius: 12,
          border: `1px solid ${T.lineStrong}`, background: T.card,
          color: T.text, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 6,
          cursor: 'pointer',
        }}>
          {I.download(15, T.text)} CSV
        </button>
      </div>

      {/* List */}
      <div style={{
        flex: 1, minHeight: 0, padding: '0 16px',
        display: 'flex', flexDirection: 'column', gap: 8,
        overflow: 'hidden',
      }}>
        {empty ? (
          <EmptyState />
        ) : (
          sessions.map(s => (
            <SessionCard key={s.id} session={s}
              expanded={state.expandedSessionId === s.id}
              onToggle={() => set({
                expandedSessionId: state.expandedSessionId === s.id ? null : s.id,
              })}
              columns={state.columns}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionCard({ session, expanded, onToggle, columns }) {
  const fullySynced = session.synced >= session.rows;
  const partial = session.synced > 0 && !fullySynced;
  const syncIcon = fullySynced ? I.cloudCheck(16, T.green)
    : partial ? I.cloud(16, T.amber)
    : I.cloudOff(16, T.textMute);
  const syncLabel = fullySynced ? '동기화됨'
    : partial ? `${session.synced}/${session.rows}`
    : '미동기화';
  const syncColor = fullySynced ? T.green : partial ? T.amber : T.textMute;

  return (
    <div style={{
      background: T.card, borderRadius: 12,
      border: `1px solid ${expanded ? 'rgba(41,121,255,0.4)' : T.line}`,
      overflow: 'hidden',
      transition: 'border 200ms',
    }}>
      <button onClick={onToggle} style={{
        width: '100%', border: 'none', background: 'transparent',
        padding: '12px 14px',
        display: 'flex', alignItems: 'center', gap: 12,
        cursor: 'pointer', textAlign: 'left',
      }}>
        {/* date */}
        <div>
          <div style={{ fontSize: 13, fontWeight: 700, color: T.text, letterSpacing: -0.2, fontFamily: 'JetBrains Mono, ui-monospace, monospace', whiteSpace: 'nowrap' }}>
            {session.date}
          </div>
          <div style={{ fontSize: 10, color: T.textMute, marginTop: 2 }}>
            {session.label}
          </div>
        </div>
        <div style={{ flex: 1 }}/>

        {/* rows */}
        <div style={{
          display: 'flex', alignItems: 'baseline', gap: 3,
          padding: '4px 10px', borderRadius: 8,
          background: 'rgba(255,255,255,0.04)',
        }}>
          <span style={{ fontSize: 14, fontWeight: 800, color: T.text, fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
            {session.rows}
          </span>
          <span style={{ fontSize: 10, color: T.textMute, fontWeight: 600 }}>행</span>
        </div>

        {/* sync */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 4,
          color: syncColor, fontSize: 11, fontWeight: 700,
        }}>
          {syncIcon}
          <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{syncLabel}</span>
        </div>

        {/* chevron */}
        <div style={{
          color: T.textDim,
          transform: expanded ? 'rotate(90deg)' : 'none',
          transition: 'transform 180ms',
        }}>
          {I.chevron(14, T.textDim)}
        </div>
      </button>

      {expanded && (
        <ExpandedRowTable session={session} columns={columns} />
      )}
    </div>
  );
}

function ExpandedRowTable({ session, columns }) {
  // synthesize sample rows
  const showCols = columns.slice(0, 4);
  const rows = Array.from({ length: 4 }).map((_, i) => {
    const seed = (i + 1) * 7;
    const r = {};
    showCols.forEach((c, ci) => {
      if (c.type === 'date') r[c.id] = session.date;
      else if (c.auto?.kind === 'seq') r[c.id] = String((parseInt(c.auto.from) || 1) + i);
      else if (c.auto?.value) r[c.id] = c.auto.value;
      else if (c.type === 'int') r[c.id] = String(((seed * (ci + 1)) % 28) + 5);
      else if (c.type === 'float') r[c.id] = (((seed * (ci + 2)) % 80) / 10 + 4).toFixed(1);
      else r[c.id] = '—';
    });
    return r;
  });

  return (
    <div style={{
      borderTop: `1px solid ${T.line}`,
      padding: '8px 10px 10px',
      background: 'rgba(255,255,255,0.015)',
      animation: 'fade-up 200ms ease-out',
    }}>
      {/* header */}
      <div style={{
        display: 'flex',
        gap: 6, padding: '4px 6px',
        fontSize: 9, fontWeight: 700, color: T.textMute, letterSpacing: 0.5,
        borderBottom: `1px solid ${T.line}`,
      }}>
        <div style={{ width: 22, flexShrink: 0 }}>#</div>
        {showCols.map(c => (
          <div key={c.id} style={{
            flex: 1, minWidth: 0,
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>{c.name}</div>
        ))}
      </div>
      {/* rows */}
      {rows.map((r, i) => (
        <div key={i} style={{
          display: 'flex',
          gap: 6, padding: '5px 6px',
          fontSize: 11, color: T.text,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : 'none',
        }}>
          <div style={{ width: 22, flexShrink: 0, color: T.textMute }}>{i + 1}</div>
          {showCols.map(c => (
            <div key={c.id} style={{
              flex: 1, minWidth: 0,
              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              color: c.mode !== 'voice' ? T.textDim : T.text,
            }}>{r[c.id]}</div>
          ))}
        </div>
      ))}
      <div style={{
        textAlign: 'center', padding: '6px 0 2px',
        fontSize: 10, color: T.textMute, fontWeight: 500,
      }}>
        … +{session.rows - rows.length}행
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div style={{
      flex: 1, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14,
      padding: '0 32px',
    }}>
      <div style={{
        width: 88, height: 88, borderRadius: '50%',
        background: 'rgba(255,255,255,0.03)',
        border: `1px dashed ${T.lineStrong}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: T.textMute,
      }}>
        {I.data(40, T.textMute)}
      </div>
      <div style={{
        fontSize: 14, fontWeight: 600, color: T.textDim, letterSpacing: -0.2,
        textAlign: 'center',
      }}>
        아직 기록된 데이터가 없습니다
      </div>
      <div style={{
        fontSize: 11, color: T.textMute, textAlign: 'center', lineHeight: 1.5,
      }}>
        입력 탭에서 음성 세션을 시작하면<br/>이곳에 표시됩니다
      </div>
    </div>
  );
}

Object.assign(window, { DataTab });
