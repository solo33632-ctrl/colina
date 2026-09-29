'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { useIntro } from './intro-provider';

type RevealProps = {
  children: ReactNode;
  /**
   * Extra classes for the wrapper. Pass a Tailwind `delay-*` here to stagger
   * this section against its siblings — the transition is real, so the delay
   * utilities apply to it directly.
   */
  className?: string;
  /**
   * Hold the reveal until the brand moment has resolved.
   *
   * Only for content below the fold. The hero must NOT wait: it is the
   * Largest Contentful Paint candidate, and an element at `opacity: 0` is not
   * an LCP candidate at all, so gating it would push LCP out by the length of
   * the intro. The hero's entrance is the overlay lifting off it.
   */
  waitForIntro?: boolean;
};

/**
 * Fades a section up, either on mount or once the brand moment has resolved.
 *
 * Server-rendered plain and visible, which is what keeps the page correct with
 * JavaScript unavailable. The hidden state is only applied in a layout effect —
 * i.e. before the browser paints — so content is never shown and then hidden.
 *
 * Built on a CSS transition rather than a keyframe so the "settled" state is a
 * plain class the browser can hold indefinitely, with no fill-mode to unwind.
 * Only `opacity` and `transform` change, so nothing here triggers layout or
 * paint, and both are direction-agnostic: the reveal is identical in RTL and
 * LTR.
 */
export function Reveal({
  children,
  className,
  waitForIntro = false,
}: RevealProps) {
  const { phase, reducedMotion } = useIntro();
  const [shown, setShown] = useState(false);
  const frame = useRef<number | null>(null);

  const ready = !waitForIntro || phase === 'done';

  useLayoutEffect(() => {
    if (!ready || reducedMotion) return;

    // Two frames: the first lets the browser paint the hidden state, the
    // second starts the transition from it. A single frame would transition
    // from the visible state and read as nothing happening.
    frame.current = requestAnimationFrame(() => {
      frame.current = requestAnimationFrame(() => setShown(true));
    });

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [ready, reducedMotion]);

  const classes = [
    'motion-reduce:transition-none motion-reduce:transform-none motion-reduce:opacity-100',
    'transition-[opacity,transform] duration-500 ease-out',
    shown ? 'translate-y-0 opacity-100' : 'translate-y-3.5 opacity-0',
    className,
  ]
    .filter(Boolean)
    .join(' ');

  return <div className={classes}>{children}</div>;
}
