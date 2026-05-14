import { ReactNode } from 'react';
import { T } from '../tokens';

interface Props {
  title: string;
  sub?: string;
  right?: ReactNode;
}

export function ScreenHeader({ title, sub, right }: Props) {
  return (
    <div
      style={{
        padding: '14px 18px 10px',
        display: 'flex',
        alignItems: 'flex-end',
        justifyContent: 'space-between',
        gap: 12,
        flexShrink: 0,
      }}
    >
      <div>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -0.4, color: T.text }}>
          {title}
        </div>
        {sub && (
          <div style={{ fontSize: 15, color: T.textDim, marginTop: 4, letterSpacing: -0.1 }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}
