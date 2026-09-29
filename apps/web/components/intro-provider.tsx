'use client';

import { useLayoutEffect, useSyncExternalStore, type ReactNode } from 'react';
import {
  getIntroServerSnapshot,
  getIntroSnapshot,
  resolveIntro,
  subscribeIntro,
  type IntroSnapshot,
} from '@/lib/intro-store';

/**
 * Resolves the once-per-session brand moment. Rendered by the home page only,
 * so a deep link never mounts it and a visitor arriving on a machine page from
 * a search never sees a splash.
 *
 * The provider itself deliberately does not subscribe: the overlay and the
 * reveal wrappers each read the store through `useIntro` so they re-render on
 * their own, and this component's `children` are server-rendered elements that
 * would otherwise be reconciled from cache and never update.
 *
 * `children` are passed straight through, so the page sections keep rendering
 * on the server.
 */
export function IntroProvider({ children }: { children: ReactNode }) {
  // Layout effect, not effect: the decision reads sessionStorage and the motion
  // preference, both browser-only, and has to land before the first paint so
  // the overlay never appears over already-painted content.
  useLayoutEffect(() => resolveIntro(), []);

  return <>{children}</>;
}

/** Subscribes to the resolved intro state. */
export function useIntro(): IntroSnapshot {
  return useSyncExternalStore<IntroSnapshot>(
    subscribeIntro,
    getIntroSnapshot,
    getIntroServerSnapshot
  );
}
