import { useEffect, useMemo, useRef, useState } from 'react';
import { T } from '../tokens';
import { I } from '../components/icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { computeTotalRows, nestedAutoValue, computeRowFromAutoChange } from '../lib/autoValue';
import { useWakeLock, lockPortrait } from '../lib/wakeLock';
import { useVoiceSession } from '../lib/useVoiceSession';
import { isSpeechSupported, speak } from '../lib/speech';
import type { Column } from '../types';

export function VoiceScreen() {
  const s = useSettingsStore();
  const sess = useSessionStore();
  const voiceSession = useVoiceSession();
  const [confidence, setConfidence] = useState<number | null>(null);

  useWakeLock(sess.phase === 'active' || sess.phase === 'complete' || sess.phase === 'paused');

  // Sync confidence display from voice session ref
  useEffect(() => {
    if (sess.phase !== 'active') return;
    const interval = setInterval(() => {
      setConfidence(voiceSession.lastConfidenceRef.current);
    }, 300);
    return () => clearInterval(interval);
  }, [sess.phase, voiceSession.lastConfidenceRef]);

  const totalRows = s.tableGenerated ? computeTotalRows(s.columns) : 0;
  const voiceCols = s.columns.filter((c) => c.input === 'voice');
  const currentCol = voiceCols[sess.activeColIdx] || voiceCols[0] || s.columns[0];

  if (sess.phase === 'ready') {
    return (
      <ReadyState
        totalRows={totalRows}
        onStart={async () => {
          await voiceSession.start(s.sessionAutoLabel || buildAutoLabel(s.columns));
          await lockPortrait();
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: 'relative',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        animation: sess.phase === 'complete' ? 'flash-green 600ms ease-out' : 'none',
      }}
    >
      <ActiveState
        totalRows={totalRows}
        columns={s.columns}
        voiceCols={voiceCols}
        currentColId={currentCol?.id}
        completing={sess.phase === 'complete'}
        paused={sess.phase === 'paused'}
        confidence={confidence}
        onEnd={() => voiceSession.stop()}
        onRestartFromCol={(id) => voiceSession.restartFromCol(id)}
        onJumpToRow={(r) => voiceSession.jumpToRow(r)}
        onTogglePause={() => {
          if (sess.phase === 'paused') voiceSession.resume();
          else voiceSession.pause();
        }}
      />
    </div>
  );
}

/** Compose a default session label like "이원창 5월 15일". */
function buildAutoLabel(columns: Column[]): string {
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}월 ${today.getDate()}일`;
  // first fixed-value auto column with a name like 농가, 라벨, 처리...
  for (const c of columns) {
    if (c.input !== 'auto') continue;
    if (c.auto.kind === 'fixed' && c.auto.value && c.auto.value !== '오늘') {
      return `${c.auto.value} ${dateStr}`;
    }
    if (c.auto.kind === 'options' && c.auto.selected.length === 1) {
      return `${c.auto.selected[0]} ${dateStr}`;
    }
  }
  return dateStr;
}

// ─── READY ────────────────────────────────────────────────────
function ReadyState({ totalRows, onStart }: { totalRows: number; onStart: () => void }) {
  const s = useSettingsStore();
  const ready = s.tableGenerated && totalRows > 0 && isSpeechSupported();
  const autoCount = s.columns.filter((c) => c.input === 'auto').length;
  const voiceCount = s.columns.filter((c) => c.input === 'voice').length;
  const ttsHint = !isSpeechSupported()
    ? '이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome 권장)'
    : !s.tableGenerated
    ? '먼저 설정 탭에서 테이블을 생성하세요'
    : '';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="음성 입력" sub={ttsHint || undefined} />
      <div
        style={{
          flex: 1, display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 24px', gap: 28,
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 168, height: 168, borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 70%, transparent)',
              border: `1px solid ${T.line}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            {I.micFilled(76, '#3A3E45')}
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute', inset: -16 - i * 12, borderRadius: '50%',
                border: `1px solid rgba(255,255,255,${0.05 - i * 0.02})`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            background: T.card, border: `1px solid ${T.line}`, borderRadius: 14,
            padding: '16px 20px',
            display: 'flex', flexDirection: 'column', gap: 12,
            width: '100%', maxWidth: 320,
          }}
        >
          <SummaryRow label="오늘 테이블" value={totalRows} unit="행" />
          <SummaryRow label="자동입력 항목" value={autoCount} unit="개" />
          <SummaryRow label="음성입력 항목" value={voiceCount} unit="개" accent />
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <button
          disabled={!ready}
          onClick={onStart}
          style={{
            width: '100%', height: 60, borderRadius: 28, border: 'none',
            background: ready ? T.blue : '#2A2D32',
            color: ready ? '#fff' : T.textMute,
            fontSize: 17, fontWeight: 800, letterSpacing: -0.3,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
            cursor: ready ? 'pointer' : 'not-allowed',
            boxShadow: ready ? `0 8px 28px ${T.blueGlow}` : 'none',
          }}
        >
          {I.mic(22, ready ? '#fff' : T.textMute)} 음성 입력 시작
        </button>
      </div>
    </div>
  );
}

function SummaryRow({ label, value, unit, accent }: { label: string; value: number; unit?: string; accent?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
      <span style={{ fontSize: 15, color: T.textDim, fontWeight: 600, letterSpacing: -0.1 }}>{label}</span>
      <span
        style={{
          fontSize: 24, fontWeight: 800,
          color: accent ? T.blue : T.text,
          letterSpacing: -0.6,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        }}
      >
        {value}
        {unit && <span style={{ fontSize: 13, color: T.textDim, fontWeight: 500, marginLeft: 4 }}>{unit}</span>}
      </span>
    </div>
  );
}

// ─── ACTIVE ───────────────────────────────────────────────────
function ActiveState({
  totalRows, columns, voiceCols, currentColId, completing, paused, confidence,
  onEnd, onRestartFromCol, onJumpToRow, onTogglePause,
}: {
  totalRows: number;
  columns: Column[];
  voiceCols: Column[];
  currentColId?: string;
  completing: boolean;
  paused: boolean;
  confidence: number | null;
  onEnd: () => void;
  onRestartFromCol: (id: string) => void;
  onJumpToRow: (row: number) => void;
  onTogglePause: () => void;
}) {
  const sess = useSessionStore();
  const row = sess.activeRow;
  const pct = totalRows > 0 ? (row / totalRows) * 100 : 0;
  const rowValues = sess.getRowValues(row);
  const [editingColId, setEditingColId] = useState<string | null>(null);

  return (
    <>
      {/* Top: row indicator + progress */}
      <div style={{ padding: '10px 18px 4px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <div
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6,
              whiteSpace: 'nowrap',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
          >
            <span style={{ fontSize: 60, fontWeight: 800, color: T.text, letterSpacing: -3, lineHeight: 1 }}>
              {row}
            </span>
            <span style={{ fontSize: 22, fontWeight: 700, color: T.textMute, letterSpacing: -0.5 }}>
              / {totalRows}
            </span>
            <span style={{ fontSize: 14, color: T.textDim, marginLeft: 6 }}>행</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {confidence !== null && confidence > 0 && confidence < 1 && !paused && (
              <span
                style={{
                  fontSize: 11, fontWeight: 700,
                  color: confidence < 0.65 ? T.amber : T.green,
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  letterSpacing: -0.2,
                }}
              >
                {Math.round(confidence * 100)}%
              </span>
            )}
            {paused ? (
              <>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: T.amber }} />
                <span style={{ fontSize: 12, color: T.amber, fontWeight: 700, letterSpacing: 0.7 }}>PAUSE</span>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: 8, height: 8, borderRadius: '50%', background: T.red,
                    animation: 'pulse-mic 1.2s ease-in-out infinite',
                  }}
                />
                <span style={{ fontSize: 12, color: T.red, fontWeight: 700, letterSpacing: 0.7 }}>REC</span>
              </>
            )}
          </div>
        </div>
        <div
          style={{
            marginTop: 6, position: 'relative', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
              width: `${pct}%`,
              background: completing ? T.green : paused ? T.amber : T.blue,
              transition: 'width 400ms ease-out, background 200ms',
              boxShadow: completing ? `0 0 12px ${T.green}` : paused ? '0 0 8px rgba(255,179,0,0.4)' : `0 0 8px ${T.blueGlow}`,
            }}
          />
        </div>
      </div>

      {/* Chip grid */}
      <div
        style={{
          padding: '10px 12px',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
          gap: 8,
          borderTop: `1px solid ${T.line}`,
          borderBottom: `1px solid ${T.line}`,
          flexShrink: 0,
          alignContent: 'flex-start',
        }}
      >
        {columns.map((c) => {
          const isVoice = c.input === 'voice';
          const value = isVoice
            ? rowValues[c.id] ?? ''
            : nestedAutoValue(columns, c, row);
          const isActive = c.id === currentColId;
          const isDone = isVoice && (rowValues[c.id] !== undefined && rowValues[c.id] !== '');
          const isEditingThis = editingColId === c.id;
          return (
            <ColumnChip
              key={c.id}
              col={c}
              value={value}
              isActive={isActive}
              isDone={isDone}
              isEditing={isEditingThis}
              onActivate={() => {
                if (c.type === 'date') return;
                if (isVoice) {
                  setEditingColId(null);
                  onRestartFromCol(c.id);
                } else {
                  setEditingColId(c.id);
                }
              }}
              onCommit={(newValue) => {
                setEditingColId(null);
                if (!isVoice && newValue !== value) {
                  const targetRow = computeRowFromAutoChange(columns, c, newValue, row);
                  if (targetRow !== null) onJumpToRow(targetRow);
                }
              }}
              onCancel={() => setEditingColId(null)}
            />
          );
        })}
      </div>

      {/* Center: mic pause toggle + end button + recognized value */}
      <div
        style={{
          flex: 1, position: 'relative',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 24px', gap: 12, minHeight: 0,
        }}
      >
        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 16,
          }}
        >
          {/* Pause toggle (large mic) */}
          <button
            onClick={onTogglePause}
            style={{
              position: 'relative', width: 76, height: 76, borderRadius: '50%',
              border: 'none', cursor: 'pointer', padding: 0,
              background: paused
                ? `radial-gradient(circle at 30% 30%, #3A3E45, #2A2D32 60%, #1A1C1F)`
                : `radial-gradient(circle at 30% 30%, #5a9bff, ${T.blue} 60%, #1755c9)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: paused ? 'none' : 'pulse-mic 1.4s ease-in-out infinite',
              boxShadow: paused ? '0 4px 14px rgba(0,0,0,0.3)' : `0 0 32px ${T.blueGlow}, 0 6px 18px rgba(0,0,0,0.4)`,
            }}
            title={paused ? '재개' : '일시정지'}
          >
            {!paused && [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  border: `1.5px solid ${T.blue}`,
                  animation: `ring-expand 2.4s ease-out ${i * 0.8}s infinite`,
                }}
              />
            ))}
            {paused
              ? I.play(28, T.textDim)
              : I.micFilled(28, '#fff')}
          </button>

          {/* End button */}
          <button
            onClick={onEnd}
            style={{
              width: 76, height: 76, borderRadius: '50%',
              border: `2px solid ${T.lineStrong}`,
              background: 'rgba(255,82,82,0.08)',
              color: T.red,
              cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: 2,
            }}
            title="입력 종료"
          >
            {I.stop(22, T.red)}
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4 }}>종료</span>
          </button>
        </div>

        <div
          style={{
            fontSize: 56, fontWeight: 800,
            color: completing ? T.green : paused ? T.textMute : T.text,
            letterSpacing: -2, lineHeight: 1,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            minHeight: 56,
            textShadow: completing ? `0 0 32px rgba(0,200,83,0.4)` : 'none',
          }}
        >
          {sess.recognizedValue || <span style={{ color: T.textMute, opacity: 0.4 }}>—</span>}
        </div>
      </div>

      {/* TTS echo */}
      <div
        style={{
          padding: '6px 16px 4px',
          borderTop: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        }}
      >
        <div
          style={{
            fontSize: 13, color: T.textDim, fontWeight: 500,
            fontStyle: 'italic', letterSpacing: -0.1, minHeight: 18,
          }}
        >
          {sess.lastTts}
        </div>
        <div
          style={{
            display: 'flex', flexWrap: 'wrap', gap: 6,
            fontSize: 11, color: T.textMute,
          }}
        >
          <span style={{ fontWeight: 700 }}>명령:</span>
          {['수정', '스킵', '일시정지', '재시작', '종료'].map((cmd) => (
            <span
              key={cmd}
              style={{
                padding: '2px 8px', borderRadius: 999,
                background: 'rgba(255,255,255,0.05)',
                color: T.textDim,
              }}
            >
              {cmd}
            </span>
          ))}
        </div>
      </div>
      <ActiveTtsSlider />
    </>
  );
}

function ActiveTtsSlider() {
  const s = useSettingsStore();
  const debounceRef = useRef<number | null>(null);
  const sample = (rate: number) => {
    if (debounceRef.current !== null) window.clearTimeout(debounceRef.current);
    debounceRef.current = window.setTimeout(() => {
      void speak('이 속도로 안내합니다.', { interrupt: true, rate });
    }, 350);
  };
  return (
    <div
      style={{
        padding: '6px 16px 10px', flexShrink: 0,
        display: 'flex', alignItems: 'center', gap: 10,
      }}
    >
      <span style={{ fontSize: 12, color: T.textMute, whiteSpace: 'nowrap' }}>속도</span>
      <input
        type="range"
        min={0.5}
        max={2}
        step={0.05}
        value={s.ttsRate}
        onChange={(e) => {
          const v = parseFloat(e.target.value);
          s.set({ ttsRate: v });
          sample(v);
        }}
        style={{ flex: 1, accentColor: T.blue }}
      />
      <span
        style={{
          fontSize: 12, fontWeight: 700, color: T.blue,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
          minWidth: 36, textAlign: 'right',
        }}
      >
        {s.ttsRate.toFixed(2)}x
      </span>
    </div>
  );
}

// ─── chip with optional inline edit ────────────────────────────
function ColumnChip({
  col, value, isActive, isDone, isEditing, onActivate, onCommit, onCancel,
}: {
  col: Column;
  value: string;
  isActive: boolean;
  isDone: boolean;
  isEditing: boolean;
  onActivate: () => void;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [local, setLocal] = useState(value);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useEffect(() => { if (!isEditing) setLocal(value); }, [value, isEditing]);
  useEffect(() => { if (isEditing) inputRef.current?.focus(); }, [isEditing]);

  const isVoice = col.input === 'voice';
  const isDate = col.type === 'date';
  const clickable = !isDate;

  let bg: string = 'rgba(255,255,255,0.05)';
  let border: string = 'transparent';
  let textColor: string = T.textDim;
  if (isActive) {
    bg = 'rgba(0,200,83,0.18)';
    border = T.green;
    textColor = T.text;
  } else if (isDone) {
    bg = 'rgba(0,200,83,0.10)';
    border = 'rgba(0,200,83,0.30)';
    textColor = T.text;
  }
  if (isEditing) {
    bg = T.blueGlow;
    border = T.blue;
  }

  const inputMode = col.type === 'int'
    ? 'numeric'
    : col.type === 'float'
    ? 'decimal'
    : 'text';

  return (
    <div
      onClick={() => { if (clickable && !isEditing) onActivate(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 10px',
        borderRadius: 12,
        fontSize: 'clamp(13px, 4vw, 16px)',
        background: bg,
        border: `2px solid ${border}`,
        color: textColor,
        fontWeight: isActive ? 800 : 700,
        cursor: clickable ? 'pointer' : 'default',
        letterSpacing: -0.1,
        minHeight: 44,
        minWidth: 0,
        overflow: 'hidden',
        transition: 'background 150ms, border 150ms',
      }}
    >
      {isActive && (
        <span style={{ color: T.green, fontSize: 14, fontWeight: 900, flexShrink: 0 }}>▶</span>
      )}
      {isDone && !isActive && I.check(12, T.green)}
      <span
        style={{
          color: isActive ? T.green : T.textMute,
          fontSize: 'clamp(11px, 3.4vw, 13px)',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          minWidth: 0,
        }}
      >
        {col.name}
      </span>
      {isEditing ? (
        <input
          ref={inputRef}
          value={local}
          inputMode={inputMode as 'numeric' | 'decimal' | 'text'}
          onChange={(e) => setLocal(e.target.value)}
          onBlur={() => onCommit(local)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommit(local);
            else if (e.key === 'Escape') onCancel();
          }}
          onClick={(e) => e.stopPropagation()}
          style={{
            flex: 1, minWidth: 0,
            background: 'transparent', border: 'none', outline: 'none',
            color: T.text,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            fontSize: 'clamp(13px, 4vw, 17px)', fontWeight: 800,
            textAlign: 'right',
          }}
        />
      ) : (
        <span
          style={{
            flex: 1,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            color: isActive ? T.text : isDone ? T.text : T.textDim,
            fontSize: 'clamp(13px, 4vw, 17px)', fontWeight: 800,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            minWidth: 0,
          }}
        >
          {value || '—'}
        </span>
      )}
    </div>
  );
}
