import { useState } from 'react';
import { T } from '../tokens';
import { I } from '../components/icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDataStore } from '../stores/dataStore';
import { syncAll } from '../lib/sync';
import { downloadCsv, sessionsToCsv } from '../lib/csv';
import type { Column, Session } from '../types';

export function DataScreen() {
  const sessions = useDataStore((s) => s.sessions);
  const expandedSessionId = useDataStore((s) => s.expandedSessionId);
  const toggleExpand = useDataStore((s) => s.toggleExpand);
  const unsynced = sessions.filter((s) => s.syncedRows < s.completedRows).length;
  const empty = sessions.length === 0;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const doSync = async () => {
    if (busy) return;
    setBusy('동기화 중...');
    setMsg(null);
    try {
      const report = await syncAll();
      if (report.message) setMsg(report.message);
      else if (report.failed > 0)
        setMsg(`${report.ok}개 성공, ${report.failed}개 실패 (${report.rows}행)`);
      else if (report.ok > 0) setMsg(`✓ ${report.rows}행 동기화 완료`);
      else setMsg('동기화할 데이터가 없습니다.');
    } catch (err) {
      setMsg('동기화 실패: ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const doCsv = () => {
    if (sessions.length === 0) {
      setMsg('내보낼 데이터가 없습니다.');
      return;
    }
    const csv = sessionsToCsv(sessions);
    const filename = `survey_${new Date().toISOString().slice(0, 10)}.csv`;
    downloadCsv(filename, csv);
    setMsg(`✓ ${filename} 다운로드됨`);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="데이터" sub={`${sessions.length}개 세션`} />

      <div style={{ padding: '0 16px 10px', display: 'flex', gap: 8, flexShrink: 0 }}>
        <button
          onClick={doSync}
          disabled={busy !== null}
          style={{
            flex: 1,
            height: 44,
            borderRadius: 12,
            border: 'none',
            background: T.blue,
            color: '#fff',
            fontSize: 13,
            fontWeight: 700,
            letterSpacing: -0.2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            cursor: 'pointer',
            position: 'relative',
            boxShadow: `0 4px 14px ${T.blueGlow}`,
          }}
        >
          {I.sync(15, '#fff')} Sheets 동기화
          {unsynced > 0 && (
            <span
              style={{
                position: 'absolute',
                top: -4,
                right: -4,
                minWidth: 20,
                height: 20,
                padding: '0 6px',
                borderRadius: 999,
                background: T.amber,
                color: '#1a1300',
                fontSize: 11,
                fontWeight: 800,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                border: '2px solid #0E0F11',
              }}
            >
              {unsynced}
            </span>
          )}
        </button>
        <button
          onClick={doCsv}
          style={{
            height: 44,
            padding: '0 14px',
            borderRadius: 12,
            border: `1px solid ${T.lineStrong}`,
            background: T.card,
            color: T.text,
            fontSize: 13,
            fontWeight: 600,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            cursor: 'pointer',
          }}
        >
          {I.download(15, T.text)} CSV
        </button>
      </div>

      {(busy || msg) && (
        <div
          style={{
            margin: '0 16px 8px',
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
            fontSize: 11,
            color: msg?.startsWith('✓') ? T.green : T.textDim,
            flexShrink: 0,
          }}
        >
          {busy || msg}
        </div>
      )}

      <div
        style={{
          flex: 1,
          minHeight: 0,
          padding: '0 16px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
          overflow: 'auto',
        }}
      >
        {empty ? (
          <EmptyState />
        ) : (
          sessions.map((s) => (
            <SessionCard
              key={s.id}
              session={s}
              expanded={expandedSessionId === s.id}
              onToggle={() => toggleExpand(s.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session,
  expanded,
  onToggle,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
}) {
  const fullySynced = session.syncedRows >= session.completedRows && session.completedRows > 0;
  const partial = session.syncedRows > 0 && !fullySynced;
  const syncIcon = fullySynced
    ? I.cloudCheck(16, T.green)
    : partial
    ? I.cloud(16, T.amber)
    : I.cloudOff(16, T.textMute);
  const syncLabel = fullySynced
    ? '동기화됨'
    : partial
    ? `${session.syncedRows}/${session.completedRows}`
    : '미동기화';
  const syncColor = fullySynced ? T.green : partial ? T.amber : T.textMute;

  return (
    <div
      style={{
        background: T.card,
        borderRadius: 12,
        border: `1px solid ${expanded ? 'rgba(41,121,255,0.4)' : T.line}`,
        overflow: 'hidden',
        transition: 'border 200ms',
        flexShrink: 0,
      }}
    >
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          border: 'none',
          background: 'transparent',
          padding: '12px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          cursor: 'pointer',
          textAlign: 'left',
          color: 'inherit',
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: T.text,
              letterSpacing: -0.2,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {session.date}
          </div>
          {session.label && (
            <div style={{ fontSize: 10, color: T.textMute, marginTop: 2 }}>{session.label}</div>
          )}
        </div>
        <div style={{ flex: 1 }} />

        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            gap: 3,
            padding: '4px 10px',
            borderRadius: 8,
            background: 'rgba(255,255,255,0.04)',
          }}
        >
          <span
            style={{
              fontSize: 14,
              fontWeight: 800,
              color: T.text,
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
          >
            {session.completedRows}
          </span>
          <span style={{ fontSize: 10, color: T.textMute, fontWeight: 600 }}>행</span>
        </div>

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            color: syncColor,
            fontSize: 11,
            fontWeight: 700,
          }}
        >
          {syncIcon}
          <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>
            {syncLabel}
          </span>
        </div>

        <div
          style={{
            color: T.textDim,
            transform: expanded ? 'rotate(90deg)' : 'none',
            transition: 'transform 180ms',
          }}
        >
          {I.chevron(14, T.textDim)}
        </div>
      </button>

      {expanded && <ExpandedRowTable session={session} />}
    </div>
  );
}

function ExpandedRowTable({ session }: { session: Session }) {
  const showCols: Column[] = session.columns.slice(0, 4);
  const rows = session.rows.slice(0, 4);
  const remaining = Math.max(0, session.completedRows - rows.length);

  return (
    <div
      style={{
        borderTop: `1px solid ${T.line}`,
        padding: '8px 10px 10px',
        background: 'rgba(255,255,255,0.015)',
        animation: 'fade-up 200ms ease-out',
      }}
    >
      <div
        style={{
          display: 'flex',
          gap: 6,
          padding: '4px 6px',
          fontSize: 9,
          fontWeight: 700,
          color: T.textMute,
          letterSpacing: 0.5,
          borderBottom: `1px solid ${T.line}`,
        }}
      >
        <div style={{ width: 22, flexShrink: 0 }}>#</div>
        {showCols.map((c) => (
          <div
            key={c.id}
            style={{
              flex: 1,
              minWidth: 0,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {c.name}
          </div>
        ))}
      </div>

      {rows.map((r, i) => (
        <div
          key={r.index}
          style={{
            display: 'flex',
            gap: 6,
            padding: '5px 6px',
            fontSize: 11,
            color: T.text,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            borderBottom: i < rows.length - 1 ? `1px solid ${T.line}` : 'none',
          }}
        >
          <div style={{ width: 22, flexShrink: 0, color: T.textMute }}>{r.index}</div>
          {showCols.map((c) => (
            <div
              key={c.id}
              style={{
                flex: 1,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
                color: c.mode !== 'voice' ? T.textDim : T.text,
              }}
            >
              {r.values[c.id] ?? '—'}
            </div>
          ))}
        </div>
      ))}

      {remaining > 0 && (
        <div
          style={{
            textAlign: 'center',
            padding: '6px 0 2px',
            fontSize: 10,
            color: T.textMute,
            fontWeight: 500,
          }}
        >
          … +{remaining}행
        </div>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        padding: '0 32px',
      }}
    >
      <div
        style={{
          width: 88,
          height: 88,
          borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          border: `1px dashed ${T.lineStrong}`,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: T.textMute,
        }}
      >
        {I.data(40, T.textMute)}
      </div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 600,
          color: T.textDim,
          letterSpacing: -0.2,
          textAlign: 'center',
        }}
      >
        아직 기록된 데이터가 없습니다
      </div>
      <div
        style={{ fontSize: 11, color: T.textMute, textAlign: 'center', lineHeight: 1.5 }}
      >
        입력 탭에서 음성 세션을 시작하면<br />이곳에 표시됩니다
      </div>
    </div>
  );
}
