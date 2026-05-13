import { T } from '../tokens';

interface Props {
  side?: 'left' | 'right';
  tall?: number;
  bars?: number;
  color?: string;
}

export function MicWave({ side = 'left', tall = 80, bars = 5, color = T.blue }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        [side]: 8,
        top: '50%',
        transform: 'translateY(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        height: tall,
        pointerEvents: 'none',
      }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: '100%',
            borderRadius: 4,
            background: color,
            opacity: 0.4 + (i % 2 ? 0.2 : 0),
            transformOrigin: 'center',
            animation: `wave-bar 900ms ease-in-out ${i * 130}ms infinite`,
          }}
        />
      ))}
    </div>
  );
}
