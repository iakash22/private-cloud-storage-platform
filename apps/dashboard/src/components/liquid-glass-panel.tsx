import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';

interface SpringState {
  x: number;
  y: number;
  rx: number;
  ry: number;
  ripple: number;
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function isFinePointerEvent(event: { pointerType?: string }): boolean {
  // Prefer the actual event — matchMedia(hover/pointer) is flaky on Windows
  // hybrid / touchscreen laptops and can flip after reload.
  const type = event.pointerType ?? 'mouse';
  return type === 'mouse' || type === 'pen' || type === '';
}

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return false;
  }
  return Boolean(
    target.closest(
      'input, textarea, select, button, a, label, [role="button"], [contenteditable="true"]',
    ),
  );
}

function springStep(
  current: number,
  target: number,
  velocity: number,
  dt: number,
  stiffness: number,
  damping: number,
) {
  const force = (target - current) * stiffness;
  const nextVelocity = velocity + force * dt - velocity * damping * dt;
  return { value: current + nextVelocity * dt, velocity: nextVelocity };
}

/**
 * Liquid-glass card: spring spotlight + tilt.
 *
 * Important reliability rules:
 * - Interactive shell stays flat so inputs/buttons always hit on first click.
 * - Tilt is painted on a decorative layer (pointer-events: none).
 * - Pointer is tracked on `window` while engaged, so tilting never fires a
 *   false `pointerleave` that kills the effect after reload / mid-hover.
 */
export function LiquidGlassPanel({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const shellRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const lastTsRef = useRef<number | null>(null);
  const engagedRef = useRef(false);
  const pressLockRef = useRef(false);
  const lastPointerRef = useRef({ x: 50, y: 32 });
  const [engaged, setEngaged] = useState(false);

  const targetRef = useRef<SpringState>({ x: 50, y: 32, rx: 0, ry: 0, ripple: 0 });
  const currentRef = useRef<SpringState>({ x: 50, y: 32, rx: 0, ry: 0, ripple: 0 });
  const velocityRef = useRef<SpringState>({ x: 0, y: 0, rx: 0, ry: 0, ripple: 0 });

  const paint = useCallback(() => {
    const node = shellRef.current;
    if (!node) {
      return;
    }
    const c = currentRef.current;
    node.style.setProperty('--lg-x', `${c.x}%`);
    node.style.setProperty('--lg-y', `${c.y}%`);
    node.style.setProperty('--lg-rx', `${c.rx.toFixed(3)}deg`);
    node.style.setProperty('--lg-ry', `${c.ry.toFixed(3)}deg`);
    node.style.setProperty('--lg-ripple', c.ripple.toFixed(3));
    // Lengths for shadow parallax (deg values are invalid in box-shadow).
    node.style.setProperty('--lg-sx', `${(-c.ry * 1.35).toFixed(2)}px`);
    node.style.setProperty('--lg-sy', `${(c.rx * 1.35).toFixed(2)}px`);
    node.dataset.active = engagedRef.current ? 'true' : 'false';
  }, []);

  const applyTargets = useCallback((pxPct: number, pyPct: number, ripple: number) => {
    const maxTilt = pressLockRef.current ? 0 : 4;
    lastPointerRef.current = { x: pxPct, y: pyPct };
    targetRef.current = {
      x: pxPct,
      y: pyPct,
      ry: (pxPct / 100 - 0.5) * (maxTilt * 2),
      rx: (0.5 - pyPct / 100) * (maxTilt * 2),
      ripple,
    };
  }, []);

  const ensureLoop = useCallback(() => {
    if (rafRef.current != null) {
      return;
    }
    lastTsRef.current = null;
    const tick = (ts: number) => {
      const last = lastTsRef.current ?? ts;
      lastTsRef.current = ts;
      const dt = Math.min(0.033, Math.max(0.008, (ts - last) / 1000));

      const tunings: Record<keyof SpringState, { stiffness: number; damping: number }> = {
        x: { stiffness: 80, damping: 16 },
        y: { stiffness: 80, damping: 16 },
        rx: { stiffness: 40, damping: 15 },
        ry: { stiffness: 40, damping: 15 },
        ripple: { stiffness: 60, damping: 14 },
      };

      let moving = false;
      for (const key of Object.keys(tunings) as (keyof SpringState)[]) {
        const { stiffness, damping } = tunings[key];
        const stepped = springStep(
          currentRef.current[key],
          targetRef.current[key],
          velocityRef.current[key],
          dt,
          stiffness,
          damping,
        );
        currentRef.current[key] = stepped.value;
        velocityRef.current[key] = stepped.velocity;
        if (
          Math.abs(targetRef.current[key] - currentRef.current[key]) > 0.02 ||
          Math.abs(stepped.velocity) > 0.02
        ) {
          moving = true;
        }
      }

      paint();

      if (moving || engagedRef.current) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        lastTsRef.current = null;
        currentRef.current = { ...targetRef.current };
        velocityRef.current = { x: 0, y: 0, rx: 0, ry: 0, ripple: 0 };
        paint();
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, [paint]);

  const disengage = useCallback(() => {
    engagedRef.current = false;
    pressLockRef.current = false;
    setEngaged(false);
    targetRef.current = { x: 50, y: 28, rx: 0, ry: 0, ripple: 0 };
    ensureLoop();
  }, [ensureLoop]);

  const updateFromClientPoint = useCallback(
    (clientX: number, clientY: number, ripple: number) => {
      const node = shellRef.current;
      if (!node) {
        return false;
      }
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }

      // Padding so tiny OS/browser jitter at the edge does not drop tracking.
      const pad = 12;
      const inside =
        clientX >= rect.left - pad &&
        clientX <= rect.right + pad &&
        clientY >= rect.top - pad &&
        clientY <= rect.bottom + pad;
      if (!inside) {
        return false;
      }

      const px = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)) * 100;
      const py = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height)) * 100;
      applyTargets(px, py, ripple);
      return true;
    },
    [applyTargets],
  );

  // Window-level tracking while engaged — survives transform/layout flicker.
  useEffect(() => {
    if (!engaged) {
      return;
    }

    const onWindowMove = (event: PointerEvent) => {
      if (prefersReducedMotion() || !isFinePointerEvent(event)) {
        return;
      }
      const stillInside = updateFromClientPoint(
        event.clientX,
        event.clientY,
        pressLockRef.current ? 0.45 : 1,
      );
      if (!stillInside) {
        disengage();
        return;
      }
      ensureLoop();
    };

    const onWindowUp = () => {
      if (!pressLockRef.current) {
        return;
      }
      pressLockRef.current = false;
      applyTargets(lastPointerRef.current.x, lastPointerRef.current.y, 1);
      ensureLoop();
    };

    window.addEventListener('pointermove', onWindowMove, { passive: true });
    window.addEventListener('pointerup', onWindowUp);
    window.addEventListener('pointercancel', onWindowUp);
    return () => {
      window.removeEventListener('pointermove', onWindowMove);
      window.removeEventListener('pointerup', onWindowUp);
      window.removeEventListener('pointercancel', onWindowUp);
    };
  }, [engaged, applyTargets, disengage, ensureLoop, updateFromClientPoint]);

  useEffect(() => {
    return () => {
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
      }
    };
  }, []);

  const onPointerEnter = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || !isFinePointerEvent(event)) {
      return;
    }
    engagedRef.current = true;
    setEngaged(true);
    updateFromClientPoint(event.clientX, event.clientY, 1);
    ensureLoop();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || !isFinePointerEvent(event)) {
      return;
    }
    if (!engagedRef.current) {
      engagedRef.current = true;
      setEngaged(true);
    }
    updateFromClientPoint(event.clientX, event.clientY, pressLockRef.current ? 0.45 : 1);
    ensureLoop();
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!isInteractiveTarget(event.target)) {
      return;
    }
    // Keep hit targets stable for the press — tilt lives on the visual layer.
    pressLockRef.current = true;
    applyTargets(lastPointerRef.current.x, lastPointerRef.current.y, 0.45);
    currentRef.current = { ...currentRef.current, rx: 0, ry: 0 };
    velocityRef.current = { ...velocityRef.current, rx: 0, ry: 0 };
    paint();
  };

  return (
    <div className="vs-auth-liquid-glass-scene">
      <div
        ref={shellRef}
        className={['vs-auth-liquid-glass', className].filter(Boolean).join(' ')}
        style={
          {
            '--lg-x': '50%',
            '--lg-y': '28%',
            '--lg-rx': '0deg',
            '--lg-ry': '0deg',
            '--lg-ripple': '0',
            '--lg-sx': '0px',
            '--lg-sy': '0px',
          } as CSSProperties
        }
        data-active="false"
        onPointerEnter={onPointerEnter}
        onPointerMove={onPointerMove}
        onPointerDown={onPointerDown}
      >
        <div className="vs-auth-liquid-glass__visual" aria-hidden="true">
          <span className="vs-auth-liquid-glass__shine" />
          <span className="vs-auth-liquid-glass__ripple" />
        </div>
        <div className="vs-auth-liquid-glass__content">{children}</div>
      </div>
    </div>
  );
}
