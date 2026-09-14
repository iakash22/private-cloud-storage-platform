import {
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';

type FlipPhase = 'idle' | 'out' | 'in';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function springHeightStep(
  current: number,
  target: number,
  velocity: number,
  dt: number,
) {
  const stiffness = 120;
  const damping = 18;
  const force = (target - current) * stiffness;
  const nextVelocity = velocity + force * dt - velocity * damping * dt;
  return { value: current + nextVelocity * dt, velocity: nextVelocity };
}

/**
 * Smooth height + horizontal flip when switching login ↔ signup content.
 */
export function AuthFlipStage({
  mode,
  children,
}: {
  mode: 'login' | 'signup';
  children: ReactNode;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<FlipPhase>('idle');
  const [displayMode, setDisplayMode] = useState(mode);
  const [pending, setPending] = useState(children);
  const [flipNonce, setFlipNonce] = useState(0);
  const childrenRef = useRef(children);
  const modeRef = useRef(mode);
  const animatingRef = useRef(false);
  const queuedModeRef = useRef<'login' | 'signup' | null>(null);
  const heightRafRef = useRef<number | null>(null);
  const timersRef = useRef<number[]>([]);
  const heightStateRef = useRef({ current: 0, target: 0, velocity: 0, lastTs: 0 });

  childrenRef.current = children;

  const clearTimers = useCallback(() => {
    for (const id of timersRef.current) {
      window.clearTimeout(id);
    }
    timersRef.current = [];
  }, []);

  const later = useCallback((fn: () => void, ms: number) => {
    const id = window.setTimeout(fn, ms);
    timersRef.current.push(id);
    return id;
  }, []);

  const stopHeightSpring = useCallback(() => {
    if (heightRafRef.current != null) {
      window.cancelAnimationFrame(heightRafRef.current);
      heightRafRef.current = null;
    }
  }, []);

  const setShellHeightPx = useCallback((px: number) => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    shell.style.height = `${Math.max(0, Math.round(px))}px`;
  }, []);

  const releaseShellHeight = useCallback(() => {
    const shell = shellRef.current;
    if (!shell) {
      return;
    }
    shell.style.height = 'auto';
  }, []);

  const measureFace = useCallback(() => {
    return faceRef.current?.scrollHeight ?? faceRef.current?.offsetHeight ?? 0;
  }, []);

  const springToHeight = useCallback(
    (target: number) => {
      stopHeightSpring();
      const shell = shellRef.current;
      if (!shell) {
        return;
      }

      const from = shell.getBoundingClientRect().height || target;
      heightStateRef.current = {
        current: from,
        target,
        velocity: 0,
        lastTs: 0,
      };
      setShellHeightPx(from);

      const tick = (ts: number) => {
        const state = heightStateRef.current;
        if (!state.lastTs) {
          state.lastTs = ts;
        }
        const dt = Math.min(0.033, Math.max(0.008, (ts - state.lastTs) / 1000));
        state.lastTs = ts;

        const stepped = springHeightStep(state.current, state.target, state.velocity, dt);
        state.current = stepped.value;
        state.velocity = stepped.velocity;
        setShellHeightPx(state.current);

        const settled =
          Math.abs(state.target - state.current) < 0.6 && Math.abs(state.velocity) < 8;
        if (settled) {
          setShellHeightPx(state.target);
          heightRafRef.current = null;
          return;
        }
        heightRafRef.current = window.requestAnimationFrame(tick);
      };

      heightRafRef.current = window.requestAnimationFrame(tick);
    },
    [setShellHeightPx, stopHeightSpring],
  );

  useLayoutEffect(() => {
    const h = measureFace();
    if (h > 0) {
      setShellHeightPx(h);
      window.requestAnimationFrame(() => { releaseShellHeight(); });
    }
    return () => {
      stopHeightSpring();
      clearTimers();
    };
  }, [measureFace, releaseShellHeight, setShellHeightPx, stopHeightSpring, clearTimers]);

  useLayoutEffect(() => {
    if (mode === modeRef.current) {
      // Keep interactive content live for the active mode. Freezing children while
      // the flip animation finishes caused submit handlers to close over stale
      // empty field state even though the DOM inputs looked filled.
      setPending(children);
      return;
    }

    if (prefersReducedMotion()) {
      modeRef.current = mode;
      queuedModeRef.current = null;
      setDisplayMode(mode);
      setPending(children);
      setPhase('idle');
      window.requestAnimationFrame(() => {
        const h = measureFace();
        setShellHeightPx(h);
        window.requestAnimationFrame(() => { releaseShellHeight(); });
      });
      return;
    }

    if (animatingRef.current) {
      queuedModeRef.current = mode;
      return;
    }

    animatingRef.current = true;
    queuedModeRef.current = null;
    clearTimers();

    const fromHeight = shellRef.current?.getBoundingClientRect().height ?? measureFace();
    setShellHeightPx(fromHeight);
    setPhase('out');

    const outMs = 280;
    const inMs = 460;
    const targetMode = mode;

    later(() => {
      modeRef.current = targetMode;
      setDisplayMode(targetMode);
      setPending(childrenRef.current);
      setPhase('in');

      window.requestAnimationFrame(() => {
        const toHeight = measureFace();
        setShellHeightPx(fromHeight);
        springToHeight(toHeight);
      });

      later(() => {
        setPhase('idle');
        releaseShellHeight();
        animatingRef.current = false;
        const queued = queuedModeRef.current;
        if (queued && queued !== modeRef.current) {
          setFlipNonce((n) => n + 1);
        } else {
          setPending(childrenRef.current);
        }
      }, inMs);
    }, outMs);
  }, [
    mode,
    children,
    flipNonce,
    measureFace,
    releaseShellHeight,
    setShellHeightPx,
    springToHeight,
    clearTimers,
    later,
  ]);

  return (
    <div
      ref={shellRef}
      className="vs-auth-flip"
      data-phase={phase}
      data-mode={displayMode}
    >
      <div ref={faceRef} className="vs-auth-flip__face">
        {pending}
      </div>
    </div>
  );
}
