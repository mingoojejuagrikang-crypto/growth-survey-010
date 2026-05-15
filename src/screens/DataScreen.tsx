import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../tokens';
import { I } from '../components/icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { useDataStore } from '../stores/dataStore';
import { syncSelected } from '../lib/sync';
import { downloadCsv, sessionsToCsv } from '../lib/csv';
import { deleteSession as dbDeleteSession, saveSession } from '../lib/db';
import type { Column, Session } from '../types';

export function DataScreen() {
  const sessions = useDataStore((s) => s.sessions);
  const expandedSessionId = useDataStore((s) => s.expandedSessionId);
  const toggleExpand = useDataStore((s) => s.toggleExpand);
  const updateRowValue = useDataStore((s) => s.updateRowValue);
  const removeSession = useDataStore((s) => s.removeSession);
  const unsynced = sessions.filter((s) => s.syncedRows < s.completedRows).length;
  const empty = sessions.length === 0;
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [syncModalOpen, setSyncModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Session | null>(null);

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

  const handleCellSave = async (sessionId: string, rowIndex: number, colId: string, value: string) => {
    updateRowValue(sessionId, rowIndex, colId, value);
    const updated = useDataStore.getState().sessions.find((x) => x.id === sessionId);
    if (updated) {
      try { await saveSession(updated); } catch { /* ignore */ }
    }
  };

  const handleSyncConfirm = async (ids: string[]) => {
    setSyncModalOpen(false);
    if (ids.length === 0) return;
    setBusy('시트에 추가 중...');
    setMsg(null);
    try {
      const report = await syncSelected(ids);
      if (report.message) setMsg(report.message);
      else if (report.failed > 0)
        setMsg(`${report.ok}개 세션 성공, ${report.failed}개 실패 (${report.rows}행 추가됨)`);
      else if (report.ok > 0) setMsg(`✓ ${report.rows}행을 시트에 추가했습니다`);
      else setMsg('추가할 새 데이터가 없습니다.');
    } catch (err) {
      setMsg('실패: ' + (err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    const id = deleteTarget.id;
    setDeleteTarget(null);
    try { await dbDeleteSession(id); } catch { /* ignore */ }
    removeSession(id);
    setMsg('세션 삭제됨');
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="데이터" sub={`${sessions.length}개 세션`} />

      <div style={{ padding: '0 16px 12px', display: 'flex', gap: 10, flexShrink: 0 }}>
        <button
          onClick={() => setSyncModalOpen(true)}
          disabled={busy !== null || sessions.length === 0}
          style={{
            flex: 1, height: 56, borderRadius: 14, border: 'none',
            background: sessions.length === 0 ? '#2A2D32' : T.blue,
            color: '#fff', fontSize: 16, fontWeight: 800, letterSpacing: -0.2,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: sessions.length === 0 ? 'not-allowed' : 'pointer',
            position: 'relative',
            boxShadow: sessions.length === 0 ? 'none' : `0 4px 14px ${T.blueGlow}`,
            opacity: sessions.length === 0 ? 0.6 : 1,
          }}
        >
          {I.sync(20, '#fff')} 시트에 데이터 추가
          {unsynced > 0 && (
            <span
              style={{
                position: 'absolute', top: -6, right: -6,
                minWidth: 26, height: 26, padding: '0 8px',
                borderRadius: 999, background: T.amber, color: '#1a1300',
                fontSize: 14, fontWeight: 800,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
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
            height: 56, padding: '0 18px', borderRadius: 14,
            border: `1px solid ${T.lineStrong}`, background: T.card,
            color: T.text, fontSize: 16, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
          }}
        >
          {I.download(20, T.text)} CSV
        </button>
      </div>

      {(busy || msg) && (
        <div
          style={{
            margin: '0 16px 10px',
            padding: '10px 14px', borderRadius: 10,
            background: 'rgba(255,255,255,0.04)',
            fontSize: 14, color: msg?.startsWith('✓') ? T.green : T.textDim,
            flexShrink: 0,
          }}
        >
          {busy || msg}
        </div>
      )}

      <div
        style={{
          flex: 1, minHeight: 0, padding: '0 16px 16px',
          display: 'flex', flexDirection: 'column', gap: 10,
          overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
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
              onDelete={() => setDeleteTarget(s)}
              onCellSave={(rowIndex, colId, value) => handleCellSave(s.id, rowIndex, colId, value)}
            />
          ))
        )}
      </div>

      {syncModalOpen && (
        <SyncSessionModal
          sessions={sessions}
          onCancel={() => setSyncModalOpen(false)}
          onConfirm={handleSyncConfirm}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="세션 삭제"
          body={`${deleteTarget.date} 세션 (${deleteTarget.completedRows}행)을 삭제할까요?\n복구할 수 없습니다.`}
          confirmLabel="삭제"
          danger
          onCancel={() => setDeleteTarget(null)}
          onConfirm={handleDeleteConfirm}
        />
      )}
    </div>
  );
}

// ─── sync modal ───────────────────────────────────────────────
function SyncSessionModal({
  sessions, onCancel, onConfirm,
}: {
  sessions: Session[];
  onCancel: () => void;
  onConfirm: (ids: string[]) => void;
}) {
  // default: unsynced only
  const defaultIds = useMemo(
    () => sessions.filter((s) => s.syncedRows < s.completedRows).map((s) => s.id),
    [sessions],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set(defaultIds));

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <Backdrop onClose={onCancel}>
      <div
        style={{
          background: T.card,
          borderRadius: 18,
          border: `1px solid ${T.line}`,
          width: '100%',
          maxWidth: 360,
          maxHeight: '78vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${T.line}`,
          }}
        >
          <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>추가할 세션 선택</div>
          <button
            onClick={onCancel}
            style={{
              width: 36, height: 36, borderRadius: 18,
              border: 'none', background: 'rgba(255,255,255,0.06)',
              color: T.textDim, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {I.close(18, T.textDim)}
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 12px' }}>
          {sessions.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: T.textMute }}>세션 없음</div>
          ) : (
            sessions.map((s) => {
              const checked = selected.has(s.id);
              const fullySynced = s.syncedRows >= s.completedRows && s.completedRows > 0;
              const pending = s.completedRows - s.syncedRows;
              return (
                <button
                  key={s.id}
                  onClick={() => toggle(s.id)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '12px 10px',
                    background: 'transparent', border: 'none', color: 'inherit',
                    borderBottom: `1px solid ${T.line}`,
                    cursor: 'pointer', textAlign: 'left',
                  }}
                >
                  <Checkbox checked={checked} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontSize: 15, fontWeight: 700, color: T.text,
                        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                      }}
                    >
                      {s.date}
                    </div>
                    <div style={{ fontSize: 12, color: T.textMute, marginTop: 2 }}>
                      {s.completedRows}행
                      {fullySynced ? ' · ✓ 동기화됨' : pending > 0 ? ` · ${pending}행 신규` : ''}
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: '12px 16px',
            display: 'flex', gap: 10,
            borderTop: `1px solid ${T.line}`,
          }}
        >
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 48, borderRadius: 14,
              border: `1px solid ${T.lineStrong}`, background: 'transparent',
              color: T.textDim, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={() => onConfirm([...selected])}
            disabled={selected.size === 0}
            style={{
              flex: 1, height: 48, borderRadius: 14,
              border: 'none',
              background: selected.size === 0 ? '#2A2D32' : T.blue,
              color: selected.size === 0 ? T.textMute : '#fff',
              fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
              cursor: selected.size === 0 ? 'not-allowed' : 'pointer',
              boxShadow: selected.size === 0 ? 'none' : `0 4px 14px ${T.blueGlow}`,
            }}
          >
            추가 ({selected.size})
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Checkbox({ checked }: { checked: boolean }) {
  return (
    <div
      style={{
        width: 24, height: 24, borderRadius: 6,
        border: `2px solid ${checked ? T.blue : T.lineStrong}`,
        background: checked ? T.blue : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0,
        transition: 'background 150ms, border 150ms',
      }}
    >
      {checked && I.check(14, '#fff')}
    </div>
  );
}

// ─── confirm modal (delete) ───────────────────────────────────
function ConfirmModal({
  title, body, confirmLabel = '확인', danger, onCancel, onConfirm,
}: {
  title: string;
  body: string;
  confirmLabel?: string;
  danger?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Backdrop onClose={onCancel}>
      <div
        style={{
          background: T.card,
          borderRadius: 18,
          border: `1px solid ${T.line}`,
          width: '100%', maxWidth: 320,
          padding: 20,
          display: 'flex', flexDirection: 'column', gap: 14,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: T.text }}>{title}</div>
        <div
          style={{
            fontSize: 14, color: T.textDim, whiteSpace: 'pre-line', lineHeight: 1.5,
          }}
        >
          {body}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
          <button
            onClick={onCancel}
            style={{
              flex: 1, height: 48, borderRadius: 14,
              border: `1px solid ${T.lineStrong}`, background: 'transparent',
              color: T.textDim, fontSize: 15, fontWeight: 700, cursor: 'pointer',
            }}
          >
            취소
          </button>
          <button
            onClick={onConfirm}
            style={{
              flex: 1, height: 48, borderRadius: 14, border: 'none',
              background: danger ? T.red : T.blue,
              color: '#fff', fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
              cursor: 'pointer',
              boxShadow: danger ? '0 4px 14px rgba(255,82,82,0.32)' : `0 4px 14px ${T.blueGlow}`,
            }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </Backdrop>
  );
}

function Backdrop({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.55)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fade-up 200ms ease-out',
      }}
    >
      {children}
    </div>
  );
}

// ─── session card ─────────────────────────────────────────────
function SessionCard({
  session, expanded, onToggle, onDelete, onCellSave,
}: {
  session: Session;
  expanded: boolean;
  onToggle: () => void;
  onDelete: () => void;
  onCellSave: (rowIndex: number, colId: string, value: string) => void;
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
      <div style={{ display: 'flex', alignItems: 'stretch' }}>
        <button
          onClick={onToggle}
          style={{
            flex: 1, border: 'none', background: 'transparent',
            padding: '16px 16px',
            display: 'flex', alignItems: 'center', gap: 14,
            cursor: 'pointer', textAlign: 'left', color: 'inherit', minHeight: 60,
          }}
        >
          <div>
            <div
              style={{
                fontSize: 16, fontWeight: 700, color: T.text,
                letterSpacing: -0.2,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                whiteSpace: 'nowrap',
              }}
            >
              {session.date}
            </div>
            {session.label && (
              <div style={{ fontSize: 13, color: T.textMute, marginTop: 3 }}>{session.label}</div>
            )}
          </div>
          <div style={{ flex: 1 }} />

          <div
            style={{
              display: 'flex', alignItems: 'baseline', gap: 4,
              padding: '6px 12px', borderRadius: 10,
              background: 'rgba(255,255,255,0.04)',
            }}
          >
            <span
              style={{
                fontSize: 18, fontWeight: 800, color: T.text,
                fontFamily: 'JetBrains Mono, ui-monospace, monospace',
              }}
            >
              {session.completedRows}
            </span>
            <span style={{ fontSize: 13, color: T.textMute, fontWeight: 600 }}>행</span>
          </div>

          <div
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              color: syncColor, fontSize: 13, fontWeight: 700,
            }}
          >
            {syncIcon}
            <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace' }}>{syncLabel}</span>
          </div>

          <div
            style={{
              color: T.textDim,
              transform: expanded ? 'rotate(90deg)' : 'none',
              transition: 'transform 180ms',
            }}
          >
            {I.chevron(18, T.textDim)}
          </div>
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          style={{
            padding: '0 14px',
            background: 'transparent', border: 'none', borderLeft: `1px solid ${T.line}`,
            color: T.red, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="세션 삭제"
        >
          {I.trash(18, T.red)}
        </button>
      </div>

      {expanded && <FullRowTable session={session} onCellSave={onCellSave} />}
    </div>
  );
}

// ─── full editable table ──────────────────────────────────────
function FullRowTable({
  session, onCellSave,
}: {
  session: Session;
  onCellSave: (rowIndex: number, colId: string, value: string) => void;
}) {
  const cols = session.columns;
  const rows = session.rows;
  const colWidthFor = (c: Column) =>
    c.type === 'date' ? 110 : c.type === 'text' || c.type === 'options' ? 100 : 80;

  return (
    <div
      style={{
        borderTop: `1px solid ${T.line}`,
        padding: 10,
        background: 'rgba(255,255,255,0.015)',
        animation: 'fade-up 200ms ease-out',
      }}
    >
      <div
        style={{
          maxHeight: 360, overflow: 'auto',
          WebkitOverflowScrolling: 'touch',
          border: `1px solid ${T.line}`, borderRadius: 8,
        }}
      >
        <div style={{ minWidth: 'max-content' }}>
          <div
            style={{
              display: 'flex',
              position: 'sticky', top: 0, zIndex: 2,
              background: T.card,
              borderBottom: `1px solid ${T.line}`,
            }}
          >
            <div
              style={{
                width: 40, padding: '8px 6px',
                fontSize: 12, fontWeight: 700, color: T.textMute,
                textAlign: 'center', position: 'sticky', left: 0, background: T.card, zIndex: 3,
                borderRight: `1px solid ${T.line}`,
              }}
            >
              #
            </div>
            {cols.map((c) => (
              <div
                key={c.id}
                style={{
                  width: colWidthFor(c), padding: '8px 8px',
                  fontSize: 12, fontWeight: 700, color: T.textDim,
                  borderRight: `1px solid ${T.line}`,
                  whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {c.name}
              </div>
            ))}
          </div>

          {rows.map((r) => (
            <div
              key={r.index}
              style={{ display: 'flex', borderBottom: `1px solid ${T.line}` }}
            >
              <div
                style={{
                  width: 40, padding: '8px 6px',
                  fontSize: 13, color: T.textMute, textAlign: 'center',
                  position: 'sticky', left: 0, background: T.card, zIndex: 1,
                  borderRight: `1px solid ${T.line}`,
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontWeight: 700,
                }}
              >
                {r.index}
              </div>
              {cols.map((c) => (
                <EditableCell
                  key={c.id}
                  col={c}
                  value={r.values[c.id] ?? ''}
                  width={colWidthFor(c)}
                  onSave={(v) => onCellSave(r.index, c.id, v)}
                />
              ))}
            </div>
          ))}

          {rows.length === 0 && (
            <div style={{ padding: 14, textAlign: 'center', fontSize: 13, color: T.textMute }}>
              이 세션에 저장된 행이 없습니다
            </div>
          )}
        </div>
      </div>
      <div
        style={{
          paddingTop: 8, fontSize: 12, color: T.textMute, textAlign: 'center',
        }}
      >
        총 {rows.length}행 · 셀을 탭하면 수정할 수 있습니다
      </div>
    </div>
  );
}

function EditableCell({
  col, value, width, onSave,
}: {
  col: Column;
  value: string;
  width: number;
  onSave: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { if (!editing) setLocal(value); }, [value, editing]);
  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  const commit = () => {
    if (local !== value) onSave(local);
    setEditing(false);
  };
  const cancel = () => {
    setLocal(value);
    setEditing(false);
  };

  const isVoice = col.input === 'voice';
  const inputMode = col.type === 'int' ? 'numeric' : col.type === 'float' ? 'decimal' : 'text';

  return (
    <div
      style={{
        width, padding: 0,
        borderRight: `1px solid ${T.line}`,
        background: editing ? 'rgba(41,121,255,0.08)' : 'transparent',
      }}
    >
      {editing ? (
        <input
          ref={inputRef}
          value={local}
          inputMode={inputMode as 'numeric' | 'decimal' | 'text'}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') cancel();
          }}
          style={{
            width: '100%', height: '100%',
            padding: '8px 8px',
            background: 'transparent', border: 'none', outline: 'none',
            color: T.text,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 14, fontWeight: 700,
            minHeight: 36,
          }}
        />
      ) : (
        <button
          onClick={() => setEditing(true)}
          style={{
            width: '100%', minHeight: 36,
            padding: '8px 8px',
            background: 'transparent', border: 'none',
            color: isVoice ? T.text : T.textDim,
            fontSize: 14, fontWeight: 700,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            textAlign: 'left', cursor: 'pointer',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}
        >
          {value || <span style={{ color: T.textMute, opacity: 0.5 }}>—</span>}
        </button>
      )}
    </div>
  );
}

function EmptyState() {
  return (
    <div
      style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        gap: 18, padding: '40px 32px',
      }}
    >
      <div
        style={{
          width: 110, height: 110, borderRadius: '50%',
          background: 'rgba(255,255,255,0.03)',
          border: `1px dashed ${T.lineStrong}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: T.textMute,
        }}
      >
        {I.data(50, T.textMute)}
      </div>
      <div
        style={{
          fontSize: 17, fontWeight: 700, color: T.textDim,
          letterSpacing: -0.2, textAlign: 'center',
        }}
      >
        아직 기록된 데이터가 없습니다
      </div>
      <div style={{ fontSize: 14, color: T.textMute, textAlign: 'center', lineHeight: 1.5 }}>
        입력 탭에서 음성 세션을 시작하면<br />이곳에 표시됩니다
      </div>
    </div>
  );
}
