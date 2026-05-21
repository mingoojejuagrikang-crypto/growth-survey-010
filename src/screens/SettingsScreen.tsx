import { useEffect, useState } from 'react';
import { T, TYPE_LABELS, TYPE_COLORS } from '../tokens';
import { I, AuthMark } from '../components/icons';
import { Chip } from '../components/Chip';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSettingsStore } from '../stores/settingsStore';
import type { Column, DataType } from '../types';
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
  fetchColumnUniqueValues,
  inferColumns,
  parseSpreadsheetId,
} from '../lib/sheets';
import { computeTotalRows, nestedAutoValue, buildCyclingValues } from '../lib/autoValue';
import { getPickerApiKey, openDrivePicker } from '../lib/drivePicker';
import { getAccessToken } from '../lib/googleAuth';
import { getKoreanVoices, setPreferredVoiceName } from '../lib/speech';

const TYPE_ORDER: DataType[] = ['date', 'text', 'int', 'float', 'options'];

// ─── small UI atoms ────────────────────────────────────────────
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
        width: wide ? 100 : 56, height: 36, borderRadius: 8,
        background: T.inputBg, border: `1px solid ${T.line}`,
        color: T.text, fontSize: 15, fontWeight: 600,
        textAlign: 'center', outline: 'none', padding: '0 6px',
        fontFamily: 'JetBrains Mono, ui-monospace, monospace',
      }}
    />
  );
}

function SegmentToggle<V extends string>({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: V;
  options: { id: V; label: string }[];
  onChange: (v: V) => void;
  disabled?: boolean;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: 12, color: T.textMute, fontWeight: 700, letterSpacing: 0.4 }}>
        {label}
      </span>
      <div
        style={{
          display: 'inline-flex', background: T.inputBg, borderRadius: 10,
          padding: 3, border: `1px solid ${T.line}`, height: 36,
          opacity: disabled ? 0.5 : 1,
        }}
      >
        {options.map((o) => {
          const active = value === o.id;
          return (
            <button
              key={o.id}
              onClick={() => !disabled && onChange(o.id)}
              style={{
                border: 'none', background: active ? T.blue : 'transparent',
                color: active ? '#fff' : T.textDim,
                fontSize: 14, fontWeight: active ? 700 : 600,
                padding: '0 14px', borderRadius: 8,
                cursor: disabled ? 'not-allowed' : 'pointer',
                letterSpacing: -0.1, height: '100%', whiteSpace: 'nowrap',
              }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── auto detail panels ────────────────────────────────────────
function AutoDetail({ col, onChange }: { col: Column; onChange: (c: Column) => void }) {
  // Numeric types support fixed or sequential
  if (col.type === 'int' || col.type === 'float') {
    if (col.auto.kind === 'seq') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, color: T.textMute }}>순차</span>
          <MiniInput
            value={col.auto.from}
            onChange={(v) =>
              onChange({ ...col, auto: { kind: 'seq', from: +v || 0, to: col.auto.kind === 'seq' ? col.auto.to : 0 } })
            }
          />
          <span style={{ color: T.textMute, fontSize: 14 }}>~</span>
          <MiniInput
            value={col.auto.to}
            onChange={(v) =>
              onChange({ ...col, auto: { kind: 'seq', from: col.auto.kind === 'seq' ? col.auto.from : 0, to: +v || 0 } })
            }
          />
          <button
            onClick={() => onChange({ ...col, auto: { kind: 'fixed', value: '' } })}
            style={linkButton}
          >
            고정값
          </button>
        </div>
      );
    }
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, color: T.textMute }}>고정값</span>
        <MiniInput
          value={col.auto.kind === 'fixed' ? col.auto.value : ''}
          placeholder="값"
          onChange={(v) => onChange({ ...col, auto: { kind: 'fixed', value: v } })}
          wide
        />
        <button
          onClick={() => onChange({ ...col, auto: { kind: 'seq', from: 1, to: 50 } })}
          style={{ ...linkButton, color: T.blue, fontWeight: 700 }}
        >
          순차로 변경
        </button>
      </div>
    );
  }

  // date type: "오늘" radio or date picker
  if (col.type === 'date') {
    const isToday = col.auto.kind !== 'fixed' || col.auto.value === '오늘' || col.auto.value === '';
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flex: 1 }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, color: T.text }}>
            <input
              type="radio"
              checked={isToday}
              onChange={() => onChange({ ...col, auto: { kind: 'fixed', value: '오늘' } })}
              style={{ accentColor: T.blue }}
            />
            오늘
          </label>
          <label style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', fontSize: 13, color: T.text }}>
            <input
              type="radio"
              checked={!isToday}
              onChange={() => {
                const today = new Date().toISOString().slice(0, 10);
                onChange({ ...col, auto: { kind: 'fixed', value: today } });
              }}
              style={{ accentColor: T.blue }}
            />
            날짜 지정
          </label>
        </div>
        {!isToday && (
          <input
            type="date"
            value={col.auto.kind === 'fixed' ? col.auto.value : ''}
            onChange={(e) => onChange({ ...col, auto: { kind: 'fixed', value: e.target.value } })}
            style={{
              height: 36, borderRadius: 8,
              background: T.inputBg, border: `1px solid ${T.line}`,
              color: T.text, fontSize: 15, fontWeight: 600,
              outline: 'none', padding: '0 10px',
            }}
          />
        )}
      </div>
    );
  }

  // text : fixed value only
  if (col.type === 'text') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1 }}>
        <span style={{ fontSize: 13, color: T.textMute }}>고정값</span>
        <input
          type="text"
          value={col.auto.kind === 'fixed' ? col.auto.value : ''}
          placeholder="값"
          onChange={(v) => onChange({ ...col, auto: { kind: 'fixed', value: v.target.value } })}
          style={{
            flex: 1, height: 36, borderRadius: 8,
            background: T.inputBg, border: `1px solid ${T.line}`,
            color: T.text, fontSize: 15, fontWeight: 600,
            outline: 'none', padding: '0 10px', minWidth: 0,
          }}
        />
      </div>
    );
  }

  // options - rendered separately
  return null;
}

const linkButton: React.CSSProperties = {
  border: 'none', background: 'transparent', color: T.textMute, fontSize: 13,
  cursor: 'pointer', textDecoration: 'underline',
};

// ─── options panel ─────────────────────────────────────────────
function OptionsPanel({ col, onChange }: { col: Column; onChange: (c: Column) => void }) {
  const [newOption, setNewOption] = useState('');
  if (col.auto.kind !== 'options') return null;
  const { available, selected } = col.auto;

  const toggle = (v: string) => {
    const isSel = selected.includes(v);
    const next = isSel ? selected.filter((x) => x !== v) : [...selected, v];
    onChange({ ...col, auto: { kind: 'options', available, selected: next } });
  };

  const addOption = () => {
    const v = newOption.trim();
    if (!v) return;
    if (available.includes(v)) {
      // already exists, just select
      if (!selected.includes(v))
        onChange({ ...col, auto: { kind: 'options', available, selected: [...selected, v] } });
    } else {
      onChange({
        ...col,
        auto: { kind: 'options', available: [...available, v], selected: [...selected, v] },
      });
    }
    setNewOption('');
  };

  return (
    <div
      style={{
        marginTop: 4,
        padding: '10px 12px',
        background: T.inputBg,
        border: `1px solid ${T.line}`,
        borderRadius: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12, fontWeight: 700, color: T.textDim, letterSpacing: 0.4 }}>
          선택값 · {selected.length} / {available.length}
        </span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 200, overflowY: 'auto' }}>
        {available.length === 0 && (
          <span style={{ fontSize: 12, color: T.textMute, fontStyle: 'italic' }}>
            등록된 값이 없습니다. 아래에서 추가하세요.
          </span>
        )}
        {available.map((v) => {
          const sel = selected.includes(v);
          return (
            <button
              key={v}
              onClick={() => toggle(v)}
              style={{
                border: `1px solid ${sel ? T.blue : T.line}`,
                background: sel ? T.blueGlow : 'rgba(255,255,255,0.04)',
                color: sel ? T.text : T.textDim,
                fontSize: 14, fontWeight: 700,
                padding: '8px 12px',
                borderRadius: 999,
                cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
                whiteSpace: 'nowrap',
              }}
            >
              {sel ? I.check(14, T.text) : null}
              {v}
            </button>
          );
        })}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        <input
          value={newOption}
          onChange={(e) => setNewOption(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              addOption();
            }
          }}
          placeholder="새 값 입력"
          style={{
            flex: 1, height: 36, borderRadius: 8,
            background: T.bg, border: `1px solid ${T.line}`,
            color: T.text, fontSize: 14, fontWeight: 600,
            outline: 'none', padding: '0 10px', minWidth: 0,
          }}
        />
        <button
          onClick={addOption}
          style={{
            height: 36, padding: '0 14px', borderRadius: 8,
            border: 'none', background: T.blue, color: '#fff',
            fontSize: 13, fontWeight: 700, cursor: 'pointer',
          }}
        >
          + 추가
        </button>
      </div>
    </div>
  );
}

// ─── column card ───────────────────────────────────────────────
function ColumnCard({
  col,
  index,
  onChange,
  onRemove,
  onDragStart,
  onDragOver,
  onDrop,
  isDragging,
  isDropTarget,
}: {
  col: Column;
  index: number;
  onChange: (c: Column) => void;
  onRemove: () => void;
  onDragStart: (idx: number) => void;
  onDragOver: (idx: number, e: React.DragEvent) => void;
  onDrop: (idx: number) => void;
  isDragging: boolean;
  isDropTarget: boolean;
}) {
  const typ = TYPE_COLORS[col.type];
  return (
    <div
      draggable
      onDragStart={() => onDragStart(index)}
      onDragOver={(e) => onDragOver(index, e)}
      onDrop={() => onDrop(index)}
      style={{
        background: T.card,
        borderRadius: 14,
        border: `1px solid ${isDropTarget ? T.blue : T.line}`,
        boxShadow: isDropTarget ? `0 0 0 2px ${T.blueGlow}` : 'none',
        padding: '10px 12px 10px 4px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        flexShrink: 0,
        opacity: isDragging ? 0.4 : 1,
        transition: 'border 150ms, box-shadow 150ms, opacity 100ms',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          style={{
            width: 28,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: T.textMute,
            cursor: 'grab',
            touchAction: 'none',
          }}
          title="드래그하여 순서 변경"
        >
          {I.grip(18)}
        </div>
        <input
          value={col.name}
          onChange={(e) => onChange({ ...col, name: e.target.value })}
          style={{
            flex: 1, background: 'transparent', border: 'none',
            color: T.text, fontSize: 18, fontWeight: 700, outline: 'none',
            letterSpacing: -0.2, padding: '2px 2px', minWidth: 0,
          }}
        />
        <button
          style={{
            height: 32, borderRadius: 999, padding: '0 12px',
            border: 'none', background: typ.bg, color: typ.fg,
            fontSize: 14, fontWeight: 700, letterSpacing: 0.1,
            display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer',
          }}
          onClick={() => {
            const next = TYPE_ORDER[(TYPE_ORDER.indexOf(col.type) + 1) % TYPE_ORDER.length];
            // When switching to options, init shape
            const auto =
              next === 'options'
                ? { kind: 'options' as const, available: [], selected: [] }
                : { kind: 'fixed' as const, value: '' };
            onChange({ ...col, type: next, auto });
          }}
        >
          {TYPE_LABELS[col.type]} {I.chevDown(12, typ.fg)}
        </button>
        <button
          onClick={onRemove}
          style={{
            width: 36, height: 36, borderRadius: 10,
            border: 'none', background: 'rgba(255,82,82,0.10)',
            color: T.red, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="항목 삭제"
        >
          {I.trash(16, T.red)}
        </button>
      </div>

      <div
        style={{
          display: 'flex', alignItems: 'center', gap: 12, paddingLeft: 32,
          minHeight: 36, flexWrap: 'wrap',
        }}
      >
        <SegmentToggle
          label="입력"
          value={col.input}
          options={[
            { id: 'auto', label: '자동' },
            { id: 'voice', label: '음성' },
          ]}
          onChange={(v) => {
            const updates: Partial<typeof col> = { input: v };
            if (v === 'voice') updates.ttsAnnounce = true;
            onChange({ ...col, ...updates });
          }}
        />
        <SegmentToggle
          label="TTS"
          value={col.ttsAnnounce ? 'on' : 'off'}
          options={[
            { id: 'on', label: '유' },
            { id: 'off', label: '무' },
          ]}
          onChange={(v) => {
            if (col.input === 'voice') return; // locked to 'on' for voice columns
            onChange({ ...col, ttsAnnounce: v === 'on' });
          }}
          disabled={col.input === 'voice'}
        />
      </div>

      {col.input === 'auto' && col.type !== 'options' && (
        <div style={{ paddingLeft: 32 }}>
          <AutoDetail col={col} onChange={onChange} />
        </div>
      )}

      {col.type === 'options' && (
        <div style={{ paddingLeft: 32 }}>
          <OptionsPanel col={col} onChange={onChange} />
        </div>
      )}
    </div>
  );
}

// ─── TTS voice selector ────────────────────────────────────────
function TtsVoiceSelector() {
  const s = useSettingsStore();
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    const refresh = () => setVoices(getKoreanVoices());
    refresh();
    window.speechSynthesis?.addEventListener('voiceschanged', refresh);
    return () => window.speechSynthesis?.removeEventListener('voiceschanged', refresh);
  }, []);

  // Sync preferred voice name into the speech module whenever it changes
  useEffect(() => {
    setPreferredVoiceName(s.preferredVoiceName);
  }, [s.preferredVoiceName]);

  if (voices.length === 0) return null;

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ fontSize: 13, fontWeight: 700, color: T.textDim }}>TTS 음성</div>
      <select
        value={s.preferredVoiceName}
        onChange={(e) => s.set({ preferredVoiceName: e.target.value })}
        style={{
          flex: 1, maxWidth: 220, height: 36, borderRadius: 8,
          background: T.inputBg, border: `1px solid ${T.line}`,
          color: T.text, fontSize: 13, fontWeight: 600,
          padding: '0 8px', outline: 'none',
        }}
      >
        <option value="">(기본)</option>
        {voices.map((v) => (
          <option key={v.name} value={v.name}>{v.name}</option>
        ))}
      </select>
    </div>
  );
}

// ─── screen root ───────────────────────────────────────────────
export function SettingsScreen() {
  const s = useSettingsStore();
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dropIdx, setDropIdx] = useState<number | null>(null);
  const [confirmedUrl, setConfirmedUrl] = useState<string>(s.sheetUrl);
  const [tablePreviewOpen, setTablePreviewOpen] = useState(false);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const googleConfigured = isGoogleConfigured();
  const previewRowCount = computeTotalRows(s.columns);
  const pickerAvailable = s.googleConnected && !!getPickerApiKey();

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
      setError('.env.local의 VITE_GOOGLE_CLIENT_ID를 설정해주세요');
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

  /** URL 입력은 상태만 갱신, 적용은 confirm 버튼에서 */
  const onUrlTyping = (url: string) => {
    s.set({ sheetUrl: url });
    setError(null);
  };

  /** "확인" 버튼: 현재 URL로 시트 정보 조회 시도 */
  const onUrlConfirm = async () => {
    setError(null);
    const url = s.sheetUrl.trim();
    if (!url) { setError('URL을 입력하세요.'); return; }
    if (!s.googleConnected) { setError('먼저 Google 로그인 후 다시 확인하세요.'); return; }
    await onUrlConfirmWithUrl(url);
  };

  const onSheetTabChange = async (newTab: string) => {
    s.set({ sheetTab: newTab });
    const id = parseSpreadsheetId(s.sheetUrl);
    if (id) await loadHeaders(id, newTab);
  };

  const loadHeaders = async (spreadsheetId: string, sheetTitle: string) => {
    try {
      setLoading('컬럼 분석 중...');
      const { headers, sample } = await fetchHeaderAndSample(spreadsheetId, sheetTitle, 50);
      const inferred = inferColumns(headers, sample);
      // For 'options' columns, fetch a richer set of unique values
      const enriched = await Promise.all(
        inferred.map(async (c, i) => {
          if (c.type !== 'options' || c.auto.kind !== 'options') return c;
          try {
            const uniq = await fetchColumnUniqueValues(spreadsheetId, sheetTitle, i, 500);
            return {
              ...c,
              auto: { kind: 'options' as const, available: uniq, selected: c.auto.selected },
            };
          } catch {
            return c;
          }
        }),
      );
      if (enriched.length) s.set({ columns: enriched, tableGenerated: false });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onPickerClick = async () => {
    setError(null);
    const token = getAccessToken();
    if (!token) {
      setError('먼저 Google 로그인 후 Drive에서 선택하세요.');
      return;
    }
    try {
      setLoading('Drive 파일 선택 중...');
      const result = await openDrivePicker(token);
      if (result) {
        s.set({ sheetUrl: result.url });
        setConfirmedUrl('');
        setError(null);
        await onUrlConfirmWithUrl(result.url);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(null);
    }
  };

  const onUrlConfirmWithUrl = async (url: string) => {
    const id = parseSpreadsheetId(url);
    if (!id) { setError('스프레드시트 URL 형식이 올바르지 않습니다.'); return; }
    s.set({ availableSheets: [], sheetTab: '' });
    try {
      setLoading('시트 정보 조회 중...');
      const meta = await fetchSpreadsheetMeta(id);
      const tabs = meta.sheets.map((sh) => sh.title);
      s.set({ availableSheets: tabs, sheetTab: tabs[0] || '' });
      if (tabs[0]) await loadHeaders(id, tabs[0]);
      setConfirmedUrl(url);
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
    // Compute session label: ISO 날짜 + 선택된 컬럼 값 (date 타입 컬럼은 중복이므로 제외)
    const isoDate = new Date().toISOString().slice(0, 10);
    let colVal = '';
    const pickedCol = s.sessionLabelColId
      ? s.columns.find((c) => c.id === s.sessionLabelColId)
      : null;
    const effectiveCol =
      pickedCol ??
      s.columns.find(
        (c) =>
          c.input === 'auto' &&
          c.type !== 'date' &&
          c.auto.kind === 'fixed' &&
          c.auto.value &&
          c.auto.value !== '오늘',
      );
    if (effectiveCol) {
      if (effectiveCol.auto.kind === 'fixed') colVal = effectiveCol.auto.value;
      else if (effectiveCol.auto.kind === 'options' && effectiveCol.auto.selected.length === 1) {
        colVal = effectiveCol.auto.selected[0];
      }
    }
    const sessionAutoLabel = colVal ? `${isoDate} ${colVal}` : isoDate;
    s.set({ tableGenerated: true, totalRows: total, sessionAutoLabel });
    setTablePreviewOpen(true);
  };

  const handleDragStart = (idx: number) => setDragIdx(idx);
  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    if (dragIdx !== null && dragIdx !== idx) setDropIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      s.reorderColumns(dragIdx, idx);
    }
    setDragIdx(null);
    setDropIdx(null);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="설정" sub="오늘의 측정 항목과 시트 연결" />

      <div
        style={{
          flex: 1, minHeight: 0,
          overflowY: 'auto', overflowX: 'hidden',
          WebkitOverflowScrolling: 'touch',
          paddingBottom: 12,
        }}
      >
        {/* Section 1 - Google + Sheet URL */}
        <div style={{ padding: '0 16px', flexShrink: 0 }}>
          <div
            style={{
              background: T.card, borderRadius: 16, padding: 14,
              border: `1px solid ${T.line}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <button
              onClick={onGoogleClick}
              disabled={loading !== null}
              style={{
                height: 56, borderRadius: 14,
                border: `1px solid ${s.googleConnected ? 'rgba(0,200,83,0.35)' : T.lineStrong}`,
                background: s.googleConnected ? 'rgba(0,200,83,0.10)' : '#2A2D32',
                color: T.text, fontSize: 17, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12,
                cursor: loading ? 'wait' : 'pointer', letterSpacing: -0.2,
                opacity: loading ? 0.7 : 1,
              }}
            >
              <AuthMark s={22} />
              {s.googleConnected ? (
                <>
                  연결됨 · <span style={{ color: T.textDim, fontWeight: 500 }}>{s.userEmail}</span>
                </>
              ) : (
                <>Google 로그인</>
              )}
              {s.googleConnected && I.check(20, T.green)}
            </button>

            {pickerAvailable ? (
              /* Drive Picker를 주 동작으로 승격 */
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={onPickerClick}
                  disabled={loading !== null}
                  style={{
                    height: 52, borderRadius: 12, border: 'none',
                    background: T.blue, color: '#fff',
                    fontSize: 15, fontWeight: 800, letterSpacing: -0.2,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    cursor: loading ? 'wait' : 'pointer',
                    boxShadow: `0 4px 14px ${T.blueGlow}`,
                    opacity: loading ? 0.7 : 1,
                  }}
                >
                  {I.link(16, '#fff')} Drive에서 시트 선택
                </button>
                {s.sheetUrl && (
                  <div
                    style={{
                      fontSize: 12, color: T.textMute, padding: '0 4px',
                      wordBreak: 'break-all', lineHeight: 1.4,
                    }}
                  >
                    {confirmedUrl && s.sheetUrl === confirmedUrl
                      ? <span style={{ color: T.green }}>{I.check(12, T.green)} 연결됨 · </span>
                      : null}
                    <span style={{ fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontSize: 11 }}>
                      {s.sheetUrl.replace(/^https?:\/\//, '').slice(0, 60)}{s.sheetUrl.length > 60 ? '…' : ''}
                    </span>
                  </div>
                )}
                <button
                  onClick={() => setShowUrlInput((v) => !v)}
                  style={{
                    alignSelf: 'flex-start',
                    background: 'transparent', border: 'none',
                    color: T.textMute, fontSize: 12, fontWeight: 600,
                    cursor: 'pointer', textDecoration: 'underline', padding: 0,
                  }}
                >
                  {showUrlInput ? '▲ URL 직접 입력 숨기기' : '▼ URL 직접 입력'}
                </button>
                {showUrlInput && (
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div
                      style={{
                        flex: 1, height: 52, borderRadius: 12,
                        background: T.inputBg, border: `1px solid ${T.line}`,
                        display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
                        minWidth: 0,
                      }}
                    >
                      <div style={{ color: T.textMute }}>{I.link(18)}</div>
                      <input
                        value={s.sheetUrl}
                        onChange={(e) => onUrlTyping(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') onUrlConfirm(); }}
                        placeholder="스프레드시트 URL 붙여넣기"
                        style={{
                          flex: 1, background: 'transparent', border: 'none', outline: 'none',
                          fontSize: 15, color: T.text, minWidth: 0,
                        }}
                      />
                    </div>
                    {(() => {
                      const applied = s.sheetUrl.trim() === confirmedUrl.trim() && s.availableSheets.length > 0;
                      const canConfirm = !!s.sheetUrl.trim() && !applied && !loading;
                      return (
                        <button
                          onClick={onUrlConfirm}
                          disabled={!canConfirm && !applied}
                          style={{
                            height: 52, padding: '0 16px', borderRadius: 12,
                            border: 'none',
                            background: applied ? 'rgba(0,200,83,0.18)' : canConfirm ? T.blue : '#2A2D32',
                            color: applied ? T.green : canConfirm ? '#fff' : T.textMute,
                            fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                            cursor: canConfirm ? 'pointer' : 'default',
                            display: 'flex', alignItems: 'center', gap: 6,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {applied ? <>{I.check(16, T.green)} 적용됨</> : '확인'}
                        </button>
                      );
                    })()}
                  </div>
                )}
              </div>
            ) : (
              /* Picker 미사용 — 기존 URL 입력 방식 */
              <div style={{ display: 'flex', gap: 8 }}>
                <div
                  style={{
                    flex: 1, height: 52, borderRadius: 12,
                    background: T.inputBg, border: `1px solid ${T.line}`,
                    display: 'flex', alignItems: 'center', gap: 10, padding: '0 12px',
                    minWidth: 0,
                  }}
                >
                  <div style={{ color: T.textMute }}>{I.link(18)}</div>
                  <input
                    value={s.sheetUrl}
                    onChange={(e) => onUrlTyping(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') onUrlConfirm(); }}
                    placeholder="스프레드시트 URL 붙여넣기"
                    style={{
                      flex: 1, background: 'transparent', border: 'none', outline: 'none',
                      fontSize: 15, color: T.text, minWidth: 0,
                    }}
                  />
                </div>
                {(() => {
                  const applied = s.sheetUrl.trim() === confirmedUrl.trim() && s.availableSheets.length > 0;
                  const canConfirm = !!s.sheetUrl.trim() && !applied && !loading;
                  return (
                    <button
                      onClick={onUrlConfirm}
                      disabled={!canConfirm && !applied}
                      style={{
                        height: 52, padding: '0 16px', borderRadius: 12,
                        border: 'none',
                        background: applied ? 'rgba(0,200,83,0.18)' : canConfirm ? T.blue : '#2A2D32',
                        color: applied ? T.green : canConfirm ? '#fff' : T.textMute,
                        fontSize: 14, fontWeight: 800, letterSpacing: -0.2,
                        cursor: canConfirm ? 'pointer' : 'default',
                        display: 'flex', alignItems: 'center', gap: 6,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {applied ? <>{I.check(16, T.green)} 적용됨</> : '확인'}
                    </button>
                  );
                })()}
              </div>
            )}

            {(s.availableSheets.length > 0 || s.sheetUrl) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontSize: 12, color: T.textMute, fontWeight: 700, padding: '0 2px' }}>
                  시트 (읽기/쓰기 모두 이 시트 사용)
                </span>
                <select
                  value={s.sheetTab}
                  onChange={(e) => onSheetTabChange(e.target.value)}
                  disabled={s.availableSheets.length === 0}
                  style={{
                    height: 48, borderRadius: 12, background: T.inputBg,
                    border: `1px solid ${T.line}`,
                    padding: '0 12px',
                    fontSize: 16, color: s.sheetTab ? T.text : T.textMute, fontWeight: 600,
                    appearance: 'none', outline: 'none',
                  }}
                >
                  {s.availableSheets.length === 0 ? (
                    <option value="">— 로그인 후 자동 로드 —</option>
                  ) : (
                    s.availableSheets.map((tab) => (
                      <option key={tab} value={tab} style={{ background: T.bg }}>
                        {tab}
                      </option>
                    ))
                  )}
                </select>
              </div>
            )}

            {(loading || error) && (
              <div
                style={{
                  fontSize: 14, color: error ? T.red : T.textDim,
                  padding: '4px 6px', lineHeight: 1.4,
                }}
              >
                {error || loading}
              </div>
            )}
          </div>
        </div>

        {/* Section 2 - Column list */}
        <div
          style={{
            marginTop: 14, paddingLeft: 16, paddingRight: 16,
            display: 'flex', flexDirection: 'column', gap: 8,
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0 4px',
            }}
          >
            <span style={{ fontSize: 13, fontWeight: 700, color: T.textDim, letterSpacing: 0.6 }}>
              컬럼 · {s.columns.length}개
            </span>
            <span style={{ fontSize: 12, color: T.textMute, whiteSpace: 'nowrap' }}>
              손잡이 끌어 순서 변경
            </span>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {s.columns.map((c, idx) => (
              <ColumnCard
                key={c.id}
                col={c}
                index={idx}
                onChange={(n) => s.updateColumn(c.id, n)}
                onRemove={() => s.removeColumn(c.id)}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDrop={handleDrop}
                isDragging={dragIdx === idx}
                isDropTarget={dropIdx === idx && dragIdx !== idx}
              />
            ))}

            <button
              onClick={s.addColumn}
              style={{
                height: 48, borderRadius: 12,
                background: 'transparent', border: `1px dashed ${T.lineStrong}`,
                color: T.textDim, fontSize: 15, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                cursor: 'pointer', flexShrink: 0,
              }}
            >
              {I.plus(16, T.textDim)} 항목 추가
            </button>
          </div>
        </div>

        {/* 세션 옵션: 세션명 컬럼 선택 + 소음 환경 모드 */}
        <div
          style={{
            marginTop: 14, padding: '0 16px',
            display: 'flex', flexDirection: 'column', gap: 10,
          }}
        >
          <div
            style={{
              background: T.card, borderRadius: 14, padding: 12,
              border: `1px solid ${T.line}`,
              display: 'flex', flexDirection: 'column', gap: 10,
            }}
          >
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textDim }}>
                세션명
              </div>
              <select
                value={s.sessionLabelColId ?? ''}
                onChange={(e) => {
                  const newColId = e.target.value || null;
                  const isoDate = new Date().toISOString().slice(0, 10);
                  let colVal = '';
                  const pickedCol = newColId
                    ? s.columns.find((c) => c.id === newColId)
                    : null;
                  const effectiveCol =
                    pickedCol ??
                    s.columns.find(
                      (c) =>
                        c.input === 'auto' &&
                        c.type !== 'date' &&
                        c.auto.kind === 'fixed' &&
                        c.auto.value &&
                        c.auto.value !== '오늘',
                    );
                  if (effectiveCol) {
                    if (effectiveCol.auto.kind === 'fixed') colVal = effectiveCol.auto.value;
                    else if (effectiveCol.auto.kind === 'options' && effectiveCol.auto.selected.length === 1) {
                      colVal = effectiveCol.auto.selected[0];
                    }
                  }
                  s.set({
                    sessionLabelColId: newColId,
                    sessionAutoLabel: colVal ? `${isoDate} ${colVal}` : isoDate,
                  });
                }}
                style={{
                  flex: 1, maxWidth: 200, height: 36, borderRadius: 8,
                  background: T.inputBg, border: `1px solid ${T.line}`,
                  color: T.text, fontSize: 14, fontWeight: 600,
                  padding: '0 8px', outline: 'none',
                }}
              >
                <option value="">(자동 선택)</option>
                {s.columns
                  .filter(
                    (c) =>
                      c.input === 'auto' &&
                      ((c.auto.kind === 'fixed' && c.auto.value && c.auto.value !== '오늘') ||
                        (c.auto.kind === 'options' && c.auto.selected.length >= 1)),
                  )
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
              </select>
            </div>
            {s.sessionAutoLabel && (
              <div style={{ fontSize: 12, color: T.textMute }}>
                세션명 미리보기: <span style={{ color: T.text, fontWeight: 700 }}>{s.sessionAutoLabel}</span>
              </div>
            )}
            <div
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                gap: 10, marginTop: 2,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 700, color: T.textDim }}>
                소음 환경 모드
              </div>
              <button
                onClick={() => s.set({ noisyMode: !s.noisyMode })}
                style={{
                  width: 60, height: 32, borderRadius: 16,
                  background: s.noisyMode ? T.blue : '#2A2D32',
                  border: 'none', cursor: 'pointer',
                  position: 'relative',
                }}
                title="음성 인식 임계값을 높이고 1자 결과를 거부합니다"
              >
                <div
                  style={{
                    position: 'absolute',
                    top: 4, left: s.noisyMode ? 32 : 4,
                    width: 24, height: 24, borderRadius: 12,
                    background: '#fff',
                    transition: 'left 150ms ease',
                  }}
                />
              </button>
            </div>
            <div style={{ fontSize: 11, color: T.textMute, lineHeight: 1.4 }}>
              비닐하우스·기계 소음 환경에서 음성 인식 정확도를 높입니다 (낮은 신뢰도 결과 거부).
            </div>

            <TtsVoiceSelector />

          </div>
        </div>

        {/* Footer: version + build date */}
        <div
          style={{
            marginTop: 18, padding: '12px 16px 8px',
            textAlign: 'center',
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          }}
        >
          <div style={{ fontSize: 14, fontWeight: 700, color: T.text }}>
            v{__APP_VERSION__}{' '}
            <span style={{ color: T.textMute, fontWeight: 500, fontSize: 12 }}>({__BUILD_DATE__})</span>
          </div>
          <div style={{ fontSize: 11, color: T.textMute, marginTop: 4 }}>
            growth-survey-010 · mingoo.jejuagri.kang@gmail.com
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div
        style={{
          padding: '12px 16px 12px',
          borderTop: `1px solid ${T.line}`,
          background: 'rgba(255,255,255,0.02)',
          display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0,
        }}
      >
        {!s.tableGenerated && s.columns.length > 0 && previewRowCount > 0 && (
          <div style={{ textAlign: 'center', fontSize: 13, color: T.textMute }}>
            현재 설정으로 <span style={{ color: T.blue, fontWeight: 700 }}>{previewRowCount}행</span> 생성 예정
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {s.tableGenerated ? (
            <>
              <button
                onClick={() => setTablePreviewOpen(true)}
                style={{
                  flex: 1, height: 56, borderRadius: 28,
                  background: 'rgba(0,200,83,0.12)',
                  border: '1px solid rgba(0,200,83,0.35)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  fontSize: 16, fontWeight: 700, color: T.green,
                  cursor: 'pointer',
                }}
              >
                {I.check(20, T.green)} 총 {s.totalRows}행 생성됨 (미리보기)
              </button>
              <button
                onClick={onGenerate}
                style={{
                  height: 56, padding: '0 18px', borderRadius: 28,
                  border: `1px solid ${T.lineStrong}`, background: 'transparent',
                  color: T.textDim, fontSize: 15, fontWeight: 700, cursor: 'pointer',
                }}
              >
                재생성
              </button>
            </>
          ) : (
            <button
              onClick={onGenerate}
              style={{
                flex: 1, height: 56, borderRadius: 28, border: 'none',
                background: T.blue, color: '#fff',
                fontSize: 18, fontWeight: 800, letterSpacing: -0.2,
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                cursor: 'pointer',
                boxShadow: `0 6px 18px ${T.blueGlow}`,
              }}
            >
              {I.table(20, '#fff')} 오늘 테이블 생성
            </button>
          )}
        </div>
      </div>

      {tablePreviewOpen && (
        <TablePreviewModal
          columns={s.columns}
          totalRows={s.totalRows}
          onClose={() => setTablePreviewOpen(false)}
        />
      )}
    </div>
  );
}

// ─── table preview modal ───────────────────────────────────────
function TablePreviewModal({
  columns, totalRows, onClose,
}: {
  columns: import('../types').Column[];
  totalRows: number;
  onClose: () => void;
}) {
  const MAX_PREVIEW = 50;
  const displayRows = Math.min(totalRows, MAX_PREVIEW);
  const colWidths = columns.map((c) =>
    c.type === 'date' ? 110 : c.type === 'text' || c.type === 'options' ? 100 : 70,
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 100,
        background: 'rgba(0,0,0,0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 16,
        animation: 'fade-up 200ms ease-out',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: T.card, borderRadius: 18, border: `1px solid ${T.line}`,
          width: '100%', maxWidth: 480, maxHeight: '84vh',
          display: 'flex', flexDirection: 'column',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        }}
      >
        <div
          style={{
            padding: '14px 16px',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            borderBottom: `1px solid ${T.line}`,
          }}
        >
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: T.text }}>테이블 미리보기</div>
            <div style={{ fontSize: 12, color: T.textMute, marginTop: 2 }}>
              총 {totalRows}행
              {totalRows > MAX_PREVIEW ? ` (처음 ${MAX_PREVIEW}행 표시)` : ''}
            </div>
          </div>
          <button
            onClick={onClose}
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

        <div style={{ flex: 1, overflow: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 'max-content' }}>
            {/* Header */}
            <div
              style={{
                display: 'flex', position: 'sticky', top: 0, zIndex: 2,
                background: T.card, borderBottom: `1px solid ${T.line}`,
              }}
            >
              <div
                style={{
                  width: 36, padding: '8px 6px', fontSize: 11, fontWeight: 700,
                  color: T.textMute, textAlign: 'center', borderRight: `1px solid ${T.line}`,
                }}
              >
                #
              </div>
              {columns.map((c, ci) => (
                <div
                  key={c.id}
                  style={{
                    width: colWidths[ci], padding: '8px 8px',
                    fontSize: 12, fontWeight: 700, color: c.input === 'voice' ? T.blue : T.textDim,
                    borderRight: `1px solid ${T.line}`,
                    whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                  }}
                >
                  {c.name}
                  {c.input === 'voice' && (
                    <span style={{ marginLeft: 4, fontSize: 10, color: T.blue }}>음성</span>
                  )}
                </div>
              ))}
            </div>
            {/* Rows */}
            {Array.from({ length: displayRows }, (_, i) => {
              const rowIndex = i + 1;
              const auto = buildCyclingValues(columns, rowIndex);
              return (
                <div
                  key={rowIndex}
                  style={{ display: 'flex', borderBottom: `1px solid ${T.line}` }}
                >
                  <div
                    style={{
                      width: 36, padding: '7px 6px', fontSize: 12,
                      color: T.textMute, textAlign: 'center',
                      borderRight: `1px solid ${T.line}`,
                      fontFamily: 'JetBrains Mono, ui-monospace, monospace', fontWeight: 700,
                    }}
                  >
                    {rowIndex}
                  </div>
                  {columns.map((c, ci) => {
                    const val = c.input === 'voice'
                      ? <span style={{ color: T.textMute, opacity: 0.4 }}>—</span>
                      : (nestedAutoValue(columns, c, rowIndex) || auto[c.id] || (
                        <span style={{ color: T.textMute, opacity: 0.3 }}>빈값</span>
                      ));
                    return (
                      <div
                        key={c.id}
                        style={{
                          width: colWidths[ci], padding: '7px 8px',
                          fontSize: 13, fontWeight: 700,
                          color: c.input === 'voice' ? T.textMute : T.text,
                          borderRight: `1px solid ${T.line}`,
                          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        }}
                      >
                        {val}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ padding: '12px 16px', borderTop: `1px solid ${T.line}` }}>
          <button
            onClick={onClose}
            style={{
              width: '100%', height: 48, borderRadius: 14, border: 'none',
              background: T.blue, color: '#fff',
              fontSize: 15, fontWeight: 800, cursor: 'pointer',
              boxShadow: `0 4px 14px ${T.blueGlow}`,
            }}
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
