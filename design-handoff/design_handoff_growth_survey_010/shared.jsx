// Shared design tokens, icons, helpers

const T = {
  bg: '#0E0F11',         // overall app bg
  card: '#1A1C1F',       // card surfaces
  cardAlt: '#222428',    // raised / nested
  line: 'rgba(255,255,255,0.07)',
  lineStrong: 'rgba(255,255,255,0.13)',
  text: '#F5F5F7',
  textDim: '#A4A8B0',
  textMute: '#6B7079',
  blue: '#2979FF',
  blueGlow: 'rgba(41,121,255,0.32)',
  green: '#00C853',
  amber: '#FFB300',
  red: '#FF5252',
  google: '#4285F4',
};

// ─── Generic SVG icons ──────────────────────────────────────────
const I = {
  settings: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1A1.7 1.7 0 004.6 9a1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z" />
    </svg>
  ),
  mic: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M19 10v2a7 7 0 01-14 0v-2" />
      <line x1="12" y1="19" x2="12" y2="22" />
    </svg>
  ),
  micFilled: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <rect x="9" y="2" width="6" height="13" rx="3" />
      <path fill="none" stroke={c} strokeWidth="2.2" strokeLinecap="round" d="M19 11v1a7 7 0 01-14 0v-1 M12 19v3" />
    </svg>
  ),
  data: (s = 24, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <ellipse cx="12" cy="5" rx="8" ry="3" />
      <path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5" />
      <path d="M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" />
    </svg>
  ),
  chevron: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6" />
    </svg>
  ),
  check: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  ),
  sync: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10" />
      <polyline points="1 20 1 14 7 14" />
      <path d="M3.5 9A9 9 0 0118 5.3L23 10M1 14l5 4.7A9 9 0 0020.5 15" />
    </svg>
  ),
  download: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  ),
  plus: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round">
      <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  ),
  grip: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill={c}>
      <circle cx="9" cy="6" r="1.4" /><circle cx="15" cy="6" r="1.4" />
      <circle cx="9" cy="12" r="1.4" /><circle cx="15" cy="12" r="1.4" />
      <circle cx="9" cy="18" r="1.4" /><circle cx="15" cy="18" r="1.4" />
    </svg>
  ),
  trash: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1.5 14a2 2 0 01-2 1.7h-7a2 2 0 01-2-1.7L5 6" />
      <path d="M10 11v6M14 11v6M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
    </svg>
  ),
  cloud: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19a4.5 4.5 0 100-9h-1.3a7 7 0 10-11.3 6.8" />
    </svg>
  ),
  cloudCheck: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.5 19a4.5 4.5 0 100-9h-1.3a7 7 0 10-11.3 6.8" />
      <polyline points="9 13.5 11 15.5 15 11.5" />
    </svg>
  ),
  cloudOff: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l18 18" />
      <path d="M22 14.5A4.5 4.5 0 0017.5 10h-1.3A7 7 0 008 5.4M5 8.3A7 7 0 005 17h11" />
    </svg>
  ),
  link: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 007.5.5l3-3a5 5 0 00-7-7l-1.5 1.5" />
      <path d="M14 11a5 5 0 00-7.5-.5l-3 3a5 5 0 007 7L12 19" />
    </svg>
  ),
  chevDown: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="6 9 12 15 18 9" />
    </svg>
  ),
  table: (s = 16, c = 'currentColor') => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="3" y1="9" x2="21" y2="9" /><line x1="3" y1="15" x2="21" y2="15" />
      <line x1="9" y1="3" x2="9" y2="21" /><line x1="15" y1="3" x2="15" y2="21" />
    </svg>
  ),
};

// ─── Type pill ─────────────────────────────────────────────────
const TYPE_LABELS = {
  date: '날짜', text: '텍스트', int: '정수', float: '실수',
};
const TYPE_COLORS = {
  date:  { fg: '#7AB8FF', bg: 'rgba(122,184,255,0.13)' },
  text:  { fg: '#C9C9D1', bg: 'rgba(201,201,209,0.10)' },
  int:   { fg: '#FFB300', bg: 'rgba(255,179,0,0.13)'  },
  float: { fg: '#FF9F70', bg: 'rgba(255,159,112,0.13)' },
};

// ─── Top heading row ──────────────────────────────────────────
function ScreenHeader({ title, sub, right }) {
  return (
    <div style={{
      padding: '14px 18px 10px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      gap: 12,
    }}>
      <div>
        <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: -0.4, color: T.text }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 12, color: T.textDim, marginTop: 3, letterSpacing: -0.1 }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

// ─── Bottom tab bar ───────────────────────────────────────────
function TabBar({ tab, setTab }) {
  const tabs = [
    { id: 'settings', label: '설정',   icon: I.settings },
    { id: 'voice',    label: '입력',   icon: I.mic },
    { id: 'data',     label: '데이터', icon: I.data },
  ];
  return (
    <div style={{
      height: 88, paddingBottom: 28, paddingTop: 4,
      background: 'rgba(14,15,17,0.92)',
      backdropFilter: 'blur(20px) saturate(160%)',
      WebkitBackdropFilter: 'blur(20px) saturate(160%)',
      borderTop: `1px solid ${T.line}`,
      display: 'flex',
    }}>
      {tabs.map(t => {
        const active = tab === t.id;
        return (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            flex: 1, border: 'none', background: 'transparent',
            display: 'flex', flexDirection: 'column', alignItems: 'center',
            gap: 4, padding: '6px 0', cursor: 'pointer', position: 'relative',
            color: active ? T.blue : T.textMute,
            minHeight: 48,
          }}>
            <div style={{
              width: 38, height: 26, borderRadius: 13,
              background: active ? T.blueGlow : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'background 200ms',
            }}>
              {t.icon(20)}
            </div>
            <div style={{
              fontSize: 11, fontWeight: active ? 700 : 500, letterSpacing: 0.1,
            }}>{t.label}</div>
          </button>
        );
      })}
    </div>
  );
}

// ─── Mic-wave bar animation ───────────────────────────────────
function MicWave({ side = 'left', tall = 80, bars = 5, color = T.blue }) {
  return (
    <div style={{
      position: 'absolute',
      [side]: 8, top: '50%', transform: 'translateY(-50%)',
      display: 'flex', alignItems: 'center', gap: 3, height: tall,
      pointerEvents: 'none',
    }}>
      {Array.from({ length: bars }).map((_, i) => (
        <div key={i} style={{
          width: 3, height: '100%', borderRadius: 4,
          background: color,
          opacity: 0.4 + (i % 2 ? 0.2 : 0),
          transformOrigin: 'center',
          animation: `wave-bar 900ms ease-in-out ${i * 130}ms infinite`,
        }}/>
      ))}
    </div>
  );
}

// ─── Status chip (small) ──────────────────────────────────────
function Chip({ children, color = T.textDim, bg = 'rgba(255,255,255,0.06)', strong = false }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 9px', borderRadius: 999, fontSize: 11,
      fontWeight: strong ? 700 : 500, color, background: bg,
      letterSpacing: -0.1, whiteSpace: 'nowrap',
    }}>{children}</span>
  );
}

// Generic "Google" auth icon — neutral, not the brand-color "G".
// A simple circle-arc mark; intentionally not a recreation of the Google logo.
function AuthMark({ s = 18 }) {
  return (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 12a9 9 0 11-3-6.7" />
      <polyline points="21 4 21 10 15 10" />
    </svg>
  );
}

Object.assign(window, {
  T, I, TYPE_LABELS, TYPE_COLORS,
  ScreenHeader, TabBar, MicWave, Chip, AuthMark,
});
