// A session-level store for the home-page brand intro.
//
// The intro is a property of the browser session, not of any one component, so
// it lives in a tiny external store rather than in component state:
//
// - It survives client-side navigation within the SPA, so walking away from the
//   home page and back does not replay the intro.
// - `useSyncExternalStore` gives it a server snapshot, so the server HTML and
//   the first client render agree and hydration stays clean, while the real
//   browser-only answer (sessionStorage + the motion preference) is applied in
//   a layout effect before the browser paints.
//
// This module touches `window` and is therefore only ever imported from client
// components. The decision rules it applies live in ./intro.ts.

import {
  INTRO_SAFETY_TIMEOUT_MS,
  markIntroSeen,
  readIntroSeen,
  shouldPlayIntro,
} from './intro';

export type IntroPhase = 'pending' | 'playing' | 'done';

export type IntroSnapshot = {
  phase: IntroPhase;
  /** True once the OS-level motion preference is known to be "reduce". */
  reducedMotion: boolean;
};

/**
 * What the server renders and what hydration starts from. A frozen constant:
 * `useSyncExternalStore` compares snapshots by reference, so returning a new
 * object per call would loop forever.
 */
const SERVER_SNAPSHOT: IntroSnapshot = {
  phase: 'pending',
  reducedMotion: false,
};

let snapshot: IntroSnapshot = SERVER_SNAPSHOT;
const listeners = new Set<() => void>();
let resolved = false;

export function subscribeIntro(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getIntroSnapshot(): IntroSnapshot {
  return snapshot;
}

export function getIntroServerSnapshot(): IntroSnapshot {
  return SERVER_SNAPSHOT;
}

function publish(next: IntroSnapshot): void {
  if (
    next.phase === snapshot.phase &&
    next.reducedMotion === snapshot.reducedMotion
  ) {
    return;
  }
  snapshot = next;
  for (const listener of listeners) listener();
}

/** Ends the intro early — the overlay calls this from its animationend. */
export function finishIntro(): void {
  publish({ ...snapshot, phase: 'done' });
}

/**
 * Resolves the intro decision for this page load. Idempotent, and called from a
 * layout effect so the answer is in place before the first paint.
 */
export function resolveIntro(): () => void {
  if (resolved) return () => {};
  resolved = true;

  const prefersReducedMotion = window.matchMedia(
    '(prefers-reduced-motion: reduce)'
  ).matches;

  const play = shouldPlayIntro({
    alreadySeen: readIntroSeen(window.sessionStorage),
    prefersReducedMotion,
  });

  if (!play) {
    publish({ phase: 'done', reducedMotion: prefersReducedMotion });
    return () => {};
  }

  // Marked before playing, not after: a visitor who reloads mid-animation
  // must not get the intro a second time.
  markIntroSeen(window.sessionStorage);
  publish({ phase: 'playing', reducedMotion: false });

  // Backstop. The normal path is the overlay's own animationend, which keeps
  // the total duration in the CSS; this only covers an event that never lands.
  const timer = window.setTimeout(finishIntro, INTRO_SAFETY_TIMEOUT_MS);
  return () => window.clearTimeout(timer);
}
