import { T } from '../tokens';
import { I } from './icons';

export type TabId = 'settings' | 'voice' | 'data';

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
}

const tabs: { id: TabId; label: string; icon: (s?: number, c?: string) => JSX.Element }[] = [
  { id: 'settings', label: '설정', icon: I.settings },
  { id: 'voice', label: '입력', icon: I.mic },
  { id: 'data', label: '데이터', icon: I.data },
];

export function TabBar({ tab, setTab }: Props) {
  return (
    <div
      style={{
        height: 88,
        paddingBottom: 28,
        paddingTop: 4,
        background: 'rgba(14,15,17,0.92)',
        backdropFilter: 'blur(20px) saturate(160%)',
        WebkitBackdropFilter: 'blur(20px) saturate(160%)',
        borderTop: `1px solid ${T.line}`,
        display: 'flex',
        flexShrink: 0,
      }}
    >
      {tabs.map((t) => {
        const active = tab === t.id;
        return (
          <button
            key={t.id}
            data-testid={`tab-${t.id}`}
            onClick={() => setTab(t.id)}
            style={{
              flex: 1,
              border: 'none',
              background: 'transparent',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 4,
              padding: '6px 0',
              cursor: 'pointer',
              color: active ? T.blue : T.textMute,
              minHeight: 48,
            }}
          >
            <div
              style={{
                width: 44,
                height: 30,
                borderRadius: 15,
                background: active ? T.blueGlow : 'transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                transition: 'background 200ms',
              }}
            >
              {t.icon(24)}
            </div>
            <div style={{ fontSize: 13, fontWeight: active ? 700 : 500, letterSpacing: 0.1 }}>
              {t.label}
            </div>
          </button>
        );
      })}
    </div>
  );
}
