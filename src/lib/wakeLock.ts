import { useEffect, useRef } from 'react';

type Sentinel = { release: () => Promise<void> };

/**
 * Keeps the screen on while `active` is true.
 * Re-acquires on visibility change (mobile browsers release on tab hide).
 * Silently no-ops on unsupported browsers.
 */
export function useWakeLock(active: boolean) {
  const sentinelRef = useRef<Sentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let released = false;

    const acquire = async () => {
      try {
        const nav = navigator as Navigator & {
          wakeLock?: { request: (t: string) => Promise<Sentinel> };
        };
        if (!nav.wakeLock) return;
        const s = await nav.wakeLock.request('screen');
        if (released) {
          s.release();
          return;
        }
        sentinelRef.current = s;
      } catch {
        /* user-denied or no permission — ignore */
      }
    };

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && active && !sentinelRef.current) {
        acquire();
      }
    };

    acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      released = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
    };
  }, [active]);
}

/** Best-effort portrait lock. Silently fails when not supported. */
export async function lockPortrait() {
  try {
    const so = screen.orientation as ScreenOrientation & {
      lock?: (o: string) => Promise<void>;
    };
    if (so?.lock) await so.lock('portrait');
  } catch {
    /* ignore — many browsers throw outside fullscreen */
  }
}
