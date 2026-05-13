import { useEffect, useState } from 'react';
import { T, TYPE_LABELS, TYPE_COLORS } from '../tokens';
import { I, AuthMark } from '../components/icons';
import { Chip } from '../components/Chip';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSettingsStore } from '../stores/settingsStore';
import type { Column, DataType, InputMode } from '../types';
import {
  getCurrentEmail,
  getStoredToken,
  isConfigured as isGoogleConfigured,
  signIn as googleSignIn,
  signOut as googleSignOut,
} from '../lib/googleAuth';
import {
  fetchHeaderAndSample,
  fetchSpreadsheetMeta,
  inferColumns,
  parseSpreadsheetId,
} from '../lib/sheets';
import { computeTotalRows } from '../lib/autoValue';

const TYPE_ORDER: DataType[] = ['date', 'text', 'int', 'float'];

function ToggleSwitch({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  const W = 32, H = 18, D = H - 4;
  return (
    <button
      onClick={() => onChange(!on)}
      style={{
        width: W, height: H, borderRadius: 999, border: 'none',
        background: on ? T.blue : 'rgba(255,255,255,0.13)',
        position: 'relative', cursor: 'pointer', padding: 0,
        transition: 'background 180ms',
      }}
    >
      <div
        style={{
          position: 'absolute', top: 2, left: on ? W - D - 2 : 2,
          width: D, height: D, borderRadius: '50%', background: '#fff',
          transition: 'left 180ms', boxShadow: '0 1px 2px rgba(0,0,0,0.3)',
        }}
      />
    </button>
  );
}

function MiniInput({
  value, onChange, placeholder, wide,
}: {
  value: string | number;
  onChange: (v: string) => void;
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: wide ? 80 : 36, height: 22, borderRadius: 6,
        background: T.inputBg, border: `1px solid ${T.line}`,
        color: T.text, fontSize: 11, fontWeight: 600,
        textAlign: 'center', outline: 'none', padding: '0 4px',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      }}
    />
  );
}

function ThreeWay({ value, onChange }: { value: InputMode; onChange: (v: InputMode) => void }) {
  const opts: { id: InputMode; label: string }[] = [
    { id: 'auto', label: '자동' },
    { id: 'voice', label: '음성' },
    { id: 'silent', label: '자동·무음' },
  ];
  return (
    <div
      style={{
        display: 'inline-flex', background: T.inputBg, borderRadius: 7,
        padding: 2, border: `1px solid ${T.line}`, height: 24,
      }}
    >
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            onClick={() => onChange(o.id)}
            style={{
              border: 'none', background: active ? T.blue : 'transparent',
              color: active ? '#fff' : T.textDim,
              fontSize: 10.5, fontWeight: active ? 700 : 600,
              padding: '0 8px', borderRadius: 6, cursor: 'pointer',
              letterSpacing: -0.1, height: '100%', whiteSpace: 'nowrap',
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AutoDetail({ col, onChange }: { col: Column; onChange: (c: Column) => void }) {
  const isInt = col.type === 'int';
  if (isInt && col.auto.kind === 'seq') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
        <span style={{ fontSize: 10, color: T.textMute, letterSpacing: -0.1 }}>순차</span>
        <MiniInput
          value={col.auto.from}
          onChange={(v) =>
            onChange({ ...col, auto: { kind: 'seq', from: +v || 0, to: col.auto.kind === 'seq' ? col.auto.to : 0 } })
          }
        />
        <span style={{ color: T.textMute, fontSize: 11 }}>~</span>
        <MiniInput
          value={col.auto.to}
          onChange={(v) =>
            onChange({ ...col, auto: { kind: 'seq', from: col.auto.kind === 'seq' ? col.auto.from : 0, to: +v || 0 } })
          }
        />
        <button
          onClick={() => onChange({ ...col, auto: { kind: 'fixed', value: '' } })}
          style={{
            border: 'none', background: 'transparent', color: T.textMute, fontSize: 10,
            cursor: 'pointer', textDecoration: 'underline',
          }}
        >
          고정
        </button>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1 }}>
      <span style={{ fontSize: 10, color: T.textMute, letterSpacing: -0.1 }}>고정값</span>
      <MiniInput
        value={col.auto.kind === 'fixed' ? col.auto.value : ''}
        placeholder={col.type === 'date' ? '오늘' : col.type === 'int' ? '0' : '값'}
        onChange={(v) => onChange({ ...col, auto: { kind: 'fixed', value: v } })}
        wide
      />
      {col.type === 'int' && (
        <button
          onClick={() => onChange({ ...col, auto: { kind: 'seq', from: 1, to: 50 } })}
          style={{
            border: 'none', background: 'transparent', color: T.blue, fontSize: 10,
            cursor: 'pointer', fontWeight: 600,
          }}
        >
          순차
        </button>
      )}
    </div>
  );
}

function ColumnCard({ col, onChange }: { col: Column; onChange: (c: Column) => void }) {
  const typ = TYPE_COLORS[col.type];
  return (
    <div
      style={{
        background: T.card, borderRadius: 12,
        border: `1px solid ${T.line}`,
        padding: '5px 8px 5px 2px',
        display: 'flex', flexDirection: 'column', gap: 3,
        flexShrink: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div
          style={{
            width: 22, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.textMute, cursor: 'grab',
          }}
        >
          {I.grip(14)}
        </div>
        <input
          value={col.name}
          onChange={(e) => onChange({ ...col, name: e.target.value })}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: T.text, fontSize: 14, fontWeight: 600, outline: 'none',
            letterSpacing: -0.2, padding: '2px 2px', minWidth: 0,
          }}
        />
        <button
          style={{
            height: 22, borderRadius: 999, padding: '0 8px',
            border: 'none', background: typ.bg, color: typ.fg,
            fontSize: 10.5, fontWeight: 700, letterSpacing: 0.1,
            display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer',
          }}
          onClick={() => {
            const next = TYPE_ORDER[(TYPE_ORDER.indexOf(col.type) + 1) % TYPE_ORDER.length];
            onChange({ ...col, type: next });
          }}
        >
          {TYPE_LABELS[col.type]} {I.chevDown(10, typ.fg)}
        </button>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 26, minHeight: 24 }}>
        <ThreeWay value={col.mode} onChange={(v) => onChange({ ...col, mode: v })} />
        {col.mode !== 'voice' && <AutoDetail col={col} onChange={onChange} />}
      </div>
    </div>
  );
}

export function SettingsScreen() {
  const s = useSettingsStore();
  const [showAllCols, setShowAllCols] = useState(false);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const visibleCols = showAllCols ? s.columns : s.columns.slice(0, 4);
  const googleConfigured = isGoogleConfigured();

  // restore session from stored token
  useEffect(() => {
    const t = getStoredToken();
    if (t && !s.googleConnected) {
      s.set({ googleConnected: true, userEmail: getCurrentEmail() });
    }
  }, []);

  const onGoogleClick = async () => {
    setError(null);
    if (s.googleConnected) {
      await googleSignOut();
      s.set({ googleConnected: false, userEmail: null });
      return;
    }
    if (!googleConfigured) {
      setError(
        '.env.local의 VITE_GOOGLE_CLIENT_ID를 설정해주세요 (Google Cloud Console > OAuth 2.0 Client ID)',
      );
      return;
    }
    try {
      setLoading('Google 로그인 중...');
      const { email } = await googleSignIn();
      s.set({ googleConnected: true, userEmail: email });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onUrlChange = async (url: string) => {
    s.set({ sheetUrl: url, availableSheets: [], sheetTab: '' });
    const id = parseSpreadsheetId(url);
    if (!id || !s.googleConnected) return;
    try {
      setLoading('시트 정보 조회 중...');
      const meta = await fetchSpreadsheetMeta(id);
      const tabs = meta.sheets.map((sh) => sh.title);
      s.set({
        availableSheets: tabs,
        sheetTab: tabs[0] || '',
      });
      // auto-load first sheet's headers
      if (tabs[0]) await loadHeaders(id, tabs[0]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onSheetTabChange = async (newTab: string) => {
    s.set({ sheetTab: newTab });
    const id = parseSpreadsheetId(s.sheetUrl);
    if (id) await loadHeaders(id, newTab);
  };

  const loadHeaders = async (spreadsheetId: string, sheetTitle: string) => {
    try {
      setLoading('컬럼 분석 중...');
      const { headers, sample } = await fetchHeaderAndSample(spreadsheetId, sheetTitle);
      const inferred = inferColumns(headers, sample);
      if (inferred.length) {
        s.set({ columns: inferred, tableGenerated: false });
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onGenerate = () => {
    if (s.tableGenerated) {
      s.set({ tableGenerated: false });
      return;
    }
    const total = computeTotalRows(s.columns);
    s.set({ tableGenerated: true, totalRows: total });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="설정" sub="오늘의 측정 항목과 시트 연결" />

      {/* Section 1 - Google + Sheet URL */}
      <div style={{ padding: '0 16px', flexShrink: 0 }}>
        <div
          style={{
            background: T.card, borderRadius: 14, padding: 10,
            border: `1px solid ${T.line}`,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <button
            onClick={onGoogleClick}
            disabled={loading !== null}
            style={{
              height: 48, borderRadius: 12,
              border: `1px solid ${s.googleConnected ? 'rgba(0,200,83,0.35)' : T.lineStrong}`,
              background: s.googleConnected ? 'rgba(0,200,83,0.10)' : '#2A2D32',
              color: T.text, fontSize: 14, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              cursor: loading ? 'wait' : 'pointer', letterSpacing: -0.2,
              opacity: loading ? 0.7 : 1,
            }}
          >
            <AuthMark s={18} />
            {s.googleConnected ? (
              <>
                연결됨 · <span style={{ color: T.textDim, fontWeight: 500 }}>{s.userEmail}</span>
              </>
            ) : (
              <>Google 로그인</>
            )}
            {s.googleConnected && I.check(16, T.green)}
          </button>

          <div
            style={{
              height: 44, borderRadius: 10,
              background: T.inputBg, border: `1px solid ${T.line}`,
              display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px',
            }}
          >
            <div style={{ color: T.textMute }}>{I.link(14)}</div>
            <input
              value={s.sheetUrl}
              onChange={(e) => onUrlChange(e.target.value)}
              placeholder="스프레드시트 URL 붙여넣기"
              style={{
                flex: 1, background: 'transparent', border: 'none', outline: 'none',
                fontSize: 12, color: T.text, minWidth: 0,
              }}
            />
            {s.sheetUrl && (
              <Chip color={T.green} bg="rgba(0,200,83,0.13)" strong>
                파싱됨
              </Chip>
            )}
          </div>

          {s.availableSheets.length > 0 && (
            <select
              value={s.sheetTab}
              onChange={(e) => onSheetTabChange(e.target.value)}
              style={{
                height: 40, borderRadius: 10, background: T.inputBg,
                border: `1px solid ${T.line}`,
                padding: '0 10px',
                fontSize: 13, color: T.text, fontWeight: 500,
                appearance: 'none',
                outline: 'none',
              }}
            >
              {s.availableSheets.map((tab) => (
                <option key={tab} value={tab} style={{ background: T.bg }}>
                  {tab}
                </option>
              ))}
            </select>
          )}

          {(loading || error) && (
            <div
              style={{
                fontSize: 11,
                color: error ? T.red : T.textDim,
                padding: '2px 4px',
              }}
            >
              {error || loading}
            </div>
          )}

          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              paddingTop: 2,
            }}
          >
            <span style={{ fontSize: 12, color: T.textDim, letterSpacing: -0.1 }}>
              링크 없이 직접 설정
            </span>
            <ToggleSwitch on={s.manualMode} onChange={(v) => s.set({ manualMode: v })} />
          </div>
        </div>
      </div>

      {/* Section 2 - Column list */}
      <div
        style={{
          marginTop: 10, paddingLeft: 16, paddingRight: 16,
          display: 'flex', flexDirection: 'column', gap: 4,
          flex: 1, minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0 4px',
          }}
        >
          <span style={{ fontSize: 10.5, fontWeight: 700, color: T.textDim, letterSpacing: 0.6 }}>
            컬럼 · {s.columns.length}개
          </span>
          <button
            onClick={() => setShowAllCols(!showAllCols)}
            style={{
              background: 'transparent', border: 'none', cursor: 'pointer',
              fontSize: 9.5, color: T.textMute, letterSpacing: -0.1, whiteSpace: 'nowrap',
            }}
          >
            {showAllCols ? '접기' : s.columns.length > 4 ? '전체 보기' : '손잡이로 순서 변경'}
          </button>
        </div>

        <div
          style={{
            display: 'flex', flexDirection: 'column', gap: 4,
            flex: 1, minHeight: 0, overflow: showAllCols ? 'auto' : 'hidden',
          }}
        >
          {visibleCols.map((c) => (
            <ColumnCard key={c.id} col={c} onChange={(n) => s.updateColumn(c.id, n)} />
          ))}

          <button
            onClick={s.addColumn}
            style={{
              height: 32, borderRadius: 10,
              background: 'transparent', border: `1px dashed ${T.lineStrong}`,
              color: T.textDim, fontSize: 11.5, fontWeight: 600,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              cursor: 'pointer', flexShrink: 0,
            }}
          >
            {I.plus(13, T.textDim)} 항목 추가
          </button>
        </div>
      </div>

      {/* Section 3 - Action bar */}
      <div
        style={{
          padding: '8px 16px 10px', borderTop: `1px solid ${T.line}`,
          background: 'rgba(255,255,255,0.015)',
          display: 'flex', alignItems: 'center', gap: 10, marginTop: 8, flexShrink: 0,
        }}
      >
        {s.tableGenerated ? (
          <>
            <div
              style={{
                flex: 1, height: 48, borderRadius: 24,
                background: 'rgba(0,200,83,0.12)',
                border: '1px solid rgba(0,200,83,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                fontSize: 13, fontWeight: 700, color: T.green,
              }}
            >
              {I.check(16, T.green)} 총 {s.totalRows}행 생성됨
            </div>
            <button
              onClick={onGenerate}
              style={{
                height: 48, padding: '0 14px', borderRadius: 24,
                border: `1px solid ${T.lineStrong}`, background: 'transparent',
                color: T.textDim, fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              재생성
            </button>
          </>
        ) : (
          <button
            onClick={onGenerate}
            style={{
              flex: 1, height: 48, borderRadius: 24, border: 'none',
              background: T.blue, color: '#fff',
              fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              cursor: 'pointer',
              boxShadow: `0 6px 18px ${T.blueGlow}`,
            }}
          >
            {I.table(16, '#fff')} 오늘 테이블 생성
          </button>
        )}
      </div>
    </div>
  );
}
