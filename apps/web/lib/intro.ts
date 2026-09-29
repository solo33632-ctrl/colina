// Decision logic for the home-page brand intro. Kept out of the component so
// it can be unit-tested without a DOM, and so the rules that decide whether a
// visitor sees the splash live in one readable place.

/**
 * sessionStorage key marking "this browser session has already had the brand
 * moment". Namespaced so it cannot collide with anything else on the origin.
 */
export const INTRO_SESSION_KEY = 'colina.intro-seen';

/**
 * Backstop only. The overlay normally unmounts itself from its own
 * `animationend` event, which keeps the total duration in CSS where the
 * keyframes live. If that event never arrives — a backgrounded tab that
 * throttles animations, a dropped `animationend` — this releases the page
 * anyway. Deliberately far longer than the ~1.12s animation so it never
 * truncates a healthy run.
 */
export const INTRO_SAFETY_TIMEOUT_MS = 4000;

/**
 * The `sizes` value declared on BOTH the header lockup and the intro overlay's
 * copy of the logo.
 *
 * They have to be identical. With different `sizes`, each `<img>` resolves to a
 * different `/_next/image` candidate for the same source, and the browser then
 * fetches the logo twice — measured at 2 requests on a 2x and a 3x display,
 * against 1 when the two values match. Sized for the largest rendered copy,
 * which is the overlay at `sm:h-40`.
 */
export const LOGO_SIZES = '240px';

export type IntroDecisionInput = {
  /** The sessionStorage marker was already set by an earlier page view. */
  alreadySeen: boolean;
  /** The visitor asked the OS to reduce motion. */
  prefersReducedMotion: boolean;
};

/**
 * The splash plays at most once per browser session, only on the home page
 * (the caller owns that, by mounting the gate on no other route), and never
 * for someone who has asked for reduced motion.
 *
 * `alreadySeen` is read from sessionStorage, so it is only knowable in the
 * browser: this returns `false` during server rendering, and the caller
 * resolves the real answer in a layout effect before the first paint.
 */
export function shouldPlayIntro({
  alreadySeen,
  prefersReducedMotion,
}: IntroDecisionInput): boolean {
  if (alreadySeen) return false;
  if (prefersReducedMotion) return false;
  return true;
}

/** Reads the session marker, tolerating storage being unavailable or denied. */
export function readIntroSeen(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    return storage.getItem(INTRO_SESSION_KEY) !== null;
  } catch {
    // Private-mode Safari and a blocked-cookies policy both throw here.
    // Treated as "not seen" so the intro still plays rather than being
    // silently suppressed by a storage failure.
    return false;
  }
}

/** Marks the session. Best-effort: a failure just means the intro replays. */
export function markIntroSeen(storage: Pick<Storage, 'setItem'>): void {
  try {
    storage.setItem(INTRO_SESSION_KEY, '1');
  } catch {
    // See readIntroSeen: nothing to do, and nothing worth surfacing.
  }
}
