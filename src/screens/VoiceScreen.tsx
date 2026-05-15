import { T } from '../tokens';
import { I } from '../components/icons';
import { ScreenHeader } from '../components/ScreenHeader';
import { useSettingsStore } from '../stores/settingsStore';
import { useSessionStore } from '../stores/sessionStore';
import { computeTotalRows, nestedAutoValue } from '../lib/autoValue';
import { useWakeLock, lockPortrait } from '../lib/wakeLock';
import { useVoiceSession } from '../lib/useVoiceSession';
import { isSpeechSupported } from '../lib/speech';
import type { Column } from '../types';

export function VoiceScreen() {
  const s = useSettingsStore();
  const sess = useSessionStore();
  const voiceSession = useVoiceSession();

  useWakeLock(sess.phase === 'active' || sess.phase === 'complete');

  const totalRows = s.tableGenerated ? computeTotalRows(s.columns) : 0;
  const voiceCols = s.columns.filter((c) => c.input === 'voice');
  const currentCol = voiceCols[sess.activeColIdx] || voiceCols[0] || s.columns[0];

  if (sess.phase === 'ready') {
    return (
      <ReadyState
        totalRows={totalRows}
        onStart={() => voiceSession.start().then(() => lockPortrait())}
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
        currentColName={currentCol?.name || '—'}
        currentColId={currentCol?.id}
        completing={sess.phase === 'complete'}
        onEnd={() => voiceSession.stop()}
        onRestartFromCol={(id) => voiceSession.restartFromCol(id)}
      />
    </div>
  );
}

// ─── READY ────────────────────────────────────────────────────
function ReadyState({ totalRows, onStart }: { totalRows: number; onStart: () => void }) {
  const s = useSettingsStore();
  const ready = s.tableGenerated && totalRows > 0 && isSpeechSupported();
  const voiceCount = s.columns.filter((c) => c.input === 'voice').length;
  const ttsHint = !isSpeechSupported()
    ? '이 브라우저는 음성 인식을 지원하지 않습니다 (Chrome 권장)'
    : !s.tableGenerated
    ? '먼저 설정 탭에서 테이블을 생성하세요'
    : '이어폰을 끼고 시작하세요';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ScreenHeader title="음성 입력" sub={ttsHint} />

      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '0 24px',
          gap: 24,
        }}
      >
        <div style={{ position: 'relative' }}>
          <div
            style={{
              width: 168,
              height: 168,
              borderRadius: '50%',
              background:
                'radial-gradient(circle, rgba(255,255,255,0.06), rgba(255,255,255,0.02) 70%, transparent)',
              border: `1px solid ${T.line}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: T.textMute,
            }}
          >
            {I.micFilled(76, '#3A3E45')}
          </div>
          {[0, 1].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                inset: -16 - i * 12,
                borderRadius: '50%',
                border: `1px solid rgba(255,255,255,${0.05 - i * 0.02})`,
              }}
            />
          ))}
        </div>

        <div
          style={{
            background: T.card,
            border: `1px solid ${T.line}`,
            borderRadius: 14,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            width: '100%',
            maxWidth: 320,
          }}
        >
          <SummaryCol label="오늘 테이블" value={totalRows} unit="행" />
          <Divider />
          <SummaryCol label="항목" value={s.columns.length} unit="개" />
          <Divider />
          <SummaryCol label="음성" value={voiceCount} accent />
        </div>

        <div
          style={{
            fontSize: 14,
            color: T.textMute,
            textAlign: 'center',
            lineHeight: 1.5,
            maxWidth: 300,
          }}
        >
          시작 후 휴대전화를 보거나 만지지 마세요.
          <br />
          모든 안내는 이어폰 음성으로 진행됩니다.
        </div>
      </div>

      <div style={{ padding: '0 16px 12px' }}>
        <button
          disabled={!ready}
          onClick={onStart}
          style={{
            width: '100%',
            height: 60,
            borderRadius: 28,
            border: 'none',
            background: ready ? T.blue : '#2A2D32',
            color: ready ? '#fff' : T.textMute,
            fontSize: 17,
            fontWeight: 800,
            letterSpacing: -0.3,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
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

function SummaryCol({
  label, value, unit, accent,
}: { label: string; value: number; unit?: string; accent?: boolean }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: 0.7 }}>
        {label}
      </div>
      <div
        style={{
          fontSize: 22, fontWeight: 800,
          color: accent ? T.blue : T.text, marginTop: 2,
          letterSpacing: -0.6,
          fontFamily: 'JetBrains Mono, ui-monospace, monospace',
        }}
      >
        {value}
        {unit && (
          <span style={{ fontSize: 12, color: T.textDim, fontWeight: 500, marginLeft: 4 }}>
            {unit}
          </span>
        )}
      </div>
    </div>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 32, background: T.line }} />;
}

// ─── ACTIVE ───────────────────────────────────────────────────
function ActiveState({
  totalRows,
  columns,
  voiceCols,
  currentColName,
  currentColId,
  completing,
  onEnd,
  onRestartFromCol,
}: {
  totalRows: number;
  columns: Column[];
  voiceCols: Column[];
  currentColName: string;
  currentColId?: string;
  completing: boolean;
  onEnd: () => void;
  onRestartFromCol: (id: string) => void;
}) {
  const sess = useSessionStore();
  const row = sess.activeRow;
  const pct = totalRows > 0 ? (row / totalRows) * 100 : 0;

  // For each column, compute current row's display value and progress state
  const colDisplays = columns.map((c) => {
    const isVoice = c.input === 'voice';
    let value: string;
    if (isVoice) {
      value = sess.currentRowValues[c.id] ?? '';
    } else {
      value = nestedAutoValue(columns, c, row);
    }
    const isActive = c.id === currentColId;
    const isDone = isVoice && !!sess.currentRowValues[c.id];
    return { col: c, value, isActive, isDone, isVoice };
  });

  return (
    <>
      {/* Top: row indicator (very large) + thin progress + REC */}
      <div style={{ padding: '12px 18px 4px', flexShrink: 0 }}>
        <div
          style={{
            display: 'flex', alignItems: 'baseline', justifyContent: 'space-between',
          }}
        >
          <div
            style={{
              display: 'flex', alignItems: 'baseline', gap: 6, whiteSpace: 'nowrap',
              fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            }}
          >
            <span
              style={{
                fontSize: 72, fontWeight: 800, color: T.text,
                letterSpacing: -3, lineHeight: 1,
              }}
            >
              {row}
            </span>
            <span style={{ fontSize: 24, fontWeight: 700, color: T.textMute, letterSpacing: -0.5 }}>
              / {totalRows}
            </span>
            <span style={{ fontSize: 14, color: T.textDim, marginLeft: 8 }}>행</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div
              style={{
                width: 8, height: 8, borderRadius: '50%', background: T.red,
                animation: 'pulse-mic 1.2s ease-in-out infinite',
              }}
            />
            <span style={{ fontSize: 12, color: T.red, fontWeight: 700, letterSpacing: 0.7 }}>
              REC
            </span>
          </div>
        </div>
        <div
          style={{
            marginTop: 6,
            position: 'relative', height: 4, borderRadius: 2,
            background: 'rgba(255,255,255,0.08)',
          }}
        >
          <div
            style={{
              position: 'absolute', left: 0, top: 0, bottom: 0, borderRadius: 2,
              width: `${pct}%`,
              background: completing ? T.green : T.blue,
              transition: 'width 400ms ease-out, background 200ms',
              boxShadow: completing ? `0 0 12px ${T.green}` : `0 0 8px ${T.blueGlow}`,
            }}
          />
        </div>
      </div>

      {/* Column strip — all cols, highlight current, tap voice to restart */}
      <div
        style={{
          padding: '8px 12px',
          display: 'flex', flexWrap: 'wrap', gap: 6,
          borderTop: `1px solid ${T.line}`,
          borderBottom: `1px solid ${T.line}`,
          alignContent: 'flex-start', flexShrink: 0,
          maxHeight: 116, overflowY: 'auto',
        }}
      >
        {colDisplays.map(({ col, value, isActive, isDone, isVoice }) => {
          const bg = isActive
            ? T.blueGlow
            : isDone
            ? 'rgba(0,200,83,0.12)'
            : 'rgba(255,255,255,0.05)';
          const border = isActive
            ? T.blue
            : isDone
            ? 'rgba(0,200,83,0.35)'
            : 'transparent';
          const cursor = isVoice ? 'pointer' : 'default';
          return (
            <button
              key={col.id}
              onClick={() => isVoice && onRestartFromCol(col.id)}
              disabled={!isVoice}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '6px 10px', borderRadius: 10,
                fontSize: 14,
                background: bg,
                border: `1.5px solid ${border}`,
                color: isActive ? T.text : isDone ? T.text : T.textDim,
                fontWeight: isActive ? 800 : 600,
                cursor,
                whiteSpace: 'nowrap',
                letterSpacing: -0.1,
                minHeight: 36,
              }}
            >
              {isActive && <span style={{ color: T.blue, fontSize: 12, fontWeight: 900 }}>▶</span>}
              {isDone && I.check(12, T.green)}
              <span style={{ color: isActive ? T.blue : T.textMute, fontSize: 12 }}>
                {col.name}:
              </span>
              <span
                style={{
                  fontFamily: 'JetBrains Mono, ui-monospace, monospace',
                  color: isActive ? T.text : isDone ? T.text : T.textDim,
                  fontWeight: 700,
                }}
              >
                {value || '—'}
              </span>
            </button>
          );
        })}
      </div>

      {/* Center: current input target + recognized value */}
      <div
        style={{
          flex: 1, position: 'relative',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center',
          padding: '0 24px', gap: 8, minHeight: 0,
        }}
      >
        <div style={{ fontSize: 12, color: T.textMute, fontWeight: 700, letterSpacing: 0.8 }}>
          다음 입력 항목
        </div>
        <div
          style={{
            fontSize: 56, fontWeight: 800, color: T.text,
            letterSpacing: -1.5, lineHeight: 1,
            textShadow: `0 0 24px rgba(41,121,255,0.18)`,
          }}
        >
          {currentColName}
        </div>

        <div style={{ position: 'relative', marginTop: 6, width: 60, height: 60 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                position: 'absolute', inset: 0, borderRadius: '50%',
                border: `1.5px solid ${T.blue}`,
                animation: `ring-expand 2.4s ease-out ${i * 0.8}s infinite`,
              }}
            />
          ))}
          <div
            style={{
              width: 60, height: 60, borderRadius: '50%',
              background: `radial-gradient(circle at 30% 30%, #5a9bff, ${T.blue} 60%, #1755c9)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: 'pulse-mic 1.4s ease-in-out infinite',
              boxShadow: `0 0 32px ${T.blueGlow}, 0 6px 18px rgba(0,0,0,0.4)`,
            }}
          >
            {I.micFilled(28, '#fff')}
          </div>
        </div>

        <div
          style={{
            fontSize: 64, fontWeight: 800,
            color: completing ? T.green : T.text,
            letterSpacing: -2, lineHeight: 1, marginTop: 4,
            fontFamily: 'JetBrains Mono, ui-monospace, monospace',
            minHeight: 64,
            textShadow: completing ? `0 0 32px rgba(0,200,83,0.4)` : 'none',
          }}
        >
          {sess.recognizedValue || <span style={{ color: T.textMute, opacity: 0.4 }}>—</span>}
        </div>
      </div>

      {/* TTS echo */}
      <div
        style={{
          padding: '8px 16px 6px',
          borderTop: `1px solid ${T.line}`,
          display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0,
        }}
      >
        <div style={{ fontSize: 10, color: T.textMute, fontWeight: 700, letterSpacing: 0.6 }}>
          TTS 응답
        </div>
        <div
          style={{
            fontSize: 13, color: T.textDim, fontWeight: 500,
            fontStyle: 'italic', letterSpacing: -0.1, minHeight: 18,
          }}
        >
          {sess.lastTts || `${currentColName} 말씀해 주세요.`}
        </div>
      </div>

      {/* Bottom: end button */}
      <div
        style={{
          padding: '8px 16px 12px',
          display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0,
        }}
      >
        <button
          onClick={onEnd}
          style={{
            flex: 1, height: 48, borderRadius: 24,
            border: `1.5px solid ${T.lineStrong}`, background: 'transparent',
            color: T.textDim, fontSize: 15, fontWeight: 700, letterSpacing: -0.2,
            cursor: 'pointer',
          }}
        >
          입력 종료
        </button>
      </div>
    </>
  );
}
