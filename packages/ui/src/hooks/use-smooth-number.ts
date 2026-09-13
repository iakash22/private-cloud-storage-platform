import { useEffect, useRef, useState } from 'react';

/**
 * Smoothly interpolates toward `target` for numerical UI (upload %, counters).
 */
export function useSmoothNumber(target: number, options: { durationMs?: number } = {}): number {
  const durationMs = options.durationMs ?? 320;
  const [display, setDisplay] = useState(target);
  const frameRef = useRef<number | null>(null);
  const displayRef = useRef(target);
  const startRef = useRef({ value: target, time: 0, from: target });

  useEffect(() => {
    displayRef.current = display;
  }, [display]);

  useEffect(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
    }

    const from = displayRef.current;
    const startTime = performance.now();
    startRef.current = { value: target, time: startTime, from };

    if (Math.abs(from - target) < 0.05) {
      setDisplay(target);
      return;
    }

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / durationMs);
      // ease-out cubic
      const eased = 1 - (1 - t) ** 3;
      const next = from + (target - from) * eased;
      setDisplay(next);
      if (t < 1) {
        frameRef.current = requestAnimationFrame(tick);
      } else {
        setDisplay(target);
        frameRef.current = null;
      }
    };

    frameRef.current = requestAnimationFrame(tick);
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [durationMs, target]);

  return display;
}
