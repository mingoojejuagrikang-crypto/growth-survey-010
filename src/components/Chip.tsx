import { CSSProperties, ReactNode } from 'react';
import { T } from '../tokens';

interface Props {
  children: ReactNode;
  color?: string;
  bg?: string;
  strong?: boolean;
  style?: CSSProperties;
}

export function Chip({
  children,
  color = T.textDim,
  bg = 'rgba(255,255,255,0.06)',
  strong = false,
  style,
}: Props) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '5px 11px',
        borderRadius: 999,
        fontSize: 13,
        fontWeight: strong ? 700 : 500,
        color,
        background: bg,
        letterSpacing: -0.1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {children}
    </span>
  );
}
