import { describe, expect, it } from 'vitest';
import {
  LOGIN_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitCheck,
} from './rate-limit';

// Deterministic via the explicit `now` parameter — no fake timers, no sleeps.
describe('rateLimitCheck with login policy', () => {
  it('allows up to the max, then blocks with whole retry seconds', () => {
    const key = `login-${Date.now()}`;
    const base = 10_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      expect(rateLimitCheck(key, LOGIN_RATE_LIMIT, base + i * 1_000)).toBe(0);
    }
    const retryAfter = rateLimitCheck(key, LOGIN_RATE_LIMIT, base + 5_000);
    expect(retryAfter).toBeGreaterThan(0);
    expect(Number.isInteger(retryAfter)).toBe(true);
  });

  it('recovers after the window expires', () => {
    const key = `login-recover-${Date.now()}`;
    const base = 20_000_000;
    for (let i = 0; i < LOGIN_RATE_LIMIT.maxAttempts; i++) {
      rateLimitCheck(key, LOGIN_RATE_LIMIT, base + i);
    }
    expect(rateLimitCheck(key, LOGIN_RATE_LIMIT, base + 1_000)).toBeGreaterThan(
      0
    );
    expect(
      rateLimitCheck(
        key,
        LOGIN_RATE_LIMIT,
        base + LOGIN_RATE_LIMIT.windowMs + 1_000
      )
    ).toBe(0);
  });
});

describe('rateLimitCheck with password-reset policy', () => {
  it('enforces its own tighter budget independently', () => {
    const key = `reset-${Date.now()}`;
    const base = 30_000_000;
    for (let i = 0; i < PASSWORD_RESET_RATE_LIMIT.maxAttempts; i++) {
      expect(
        rateLimitCheck(key, PASSWORD_RESET_RATE_LIMIT, base + i * 1_000)
      ).toBe(0);
    }
    expect(
      rateLimitCheck(key, PASSWORD_RESET_RATE_LIMIT, base + 5_000)
    ).toBeGreaterThan(0);
    // A different key is unaffected.
    expect(
      rateLimitCheck(
        `reset-other-${Date.now()}`,
        PASSWORD_RESET_RATE_LIMIT,
        base
      )
    ).toBe(0);
  });
});
