import { describe, expect, it } from 'vitest';

import {
  INTRO_SAFETY_TIMEOUT_MS,
  INTRO_SESSION_KEY,
  markIntroSeen,
  readIntroSeen,
  shouldPlayIntro,
} from './intro';

describe('shouldPlayIntro', () => {
  it('plays for a first-time visitor with no motion preference', () => {
    expect(
      shouldPlayIntro({ alreadySeen: false, prefersReducedMotion: false })
    ).toBe(true);
  });

  it('never plays twice in the same session', () => {
    expect(
      shouldPlayIntro({ alreadySeen: true, prefersReducedMotion: false })
    ).toBe(false);
  });

  it('never plays for a visitor who asked for reduced motion', () => {
    expect(
      shouldPlayIntro({ alreadySeen: false, prefersReducedMotion: true })
    ).toBe(false);
  });

  it('reduced motion wins even when the session is unseen', () => {
    // Order matters: a returning visitor with reduced motion must not get an
    // animation on a later page view either.
    expect(
      shouldPlayIntro({ alreadySeen: true, prefersReducedMotion: true })
    ).toBe(false);
  });
});

describe('readIntroSeen / markIntroSeen', () => {
  it('round-trips through the session marker', () => {
    const store = new Map<string, string>();
    const storage = {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
    };

    expect(readIntroSeen(storage)).toBe(false);
    markIntroSeen(storage);
    expect(store.get(INTRO_SESSION_KEY)).toBe('1');
    expect(readIntroSeen(storage)).toBe(true);
  });

  it('reports "not seen" when storage throws, so the intro still plays', () => {
    const storage = {
      getItem: () => {
        throw new Error('SecurityError: storage is blocked');
      },
    };
    expect(readIntroSeen(storage)).toBe(false);
  });

  it('does not throw when the session cannot be marked', () => {
    const storage = {
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(() => markIntroSeen(storage)).not.toThrow();
  });
});

describe('INTRO_SAFETY_TIMEOUT_MS', () => {
  it('is a backstop well beyond the ~1.12s animation', () => {
    // The overlay unmounts from its own animationend, so this only ever fires
    // when something went wrong. If it were close to the animation length it
    // would start truncating healthy runs.
    expect(INTRO_SAFETY_TIMEOUT_MS).toBeGreaterThan(1120 * 2);
  });
});
