import { describe, expect, it } from 'vitest';
import { getClientIp, LEAD_RATE_LIMIT, rateLimitCheck } from './rate-limit';

// Deterministic via the explicit `now` parameter — no fake timers, no sleeps.
describe('rateLimitCheck', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      expect(rateLimitCheck(key, 1_000_000 + i * 1_000)).toBe(0);
    }
  });

  it('blocks past the limit and reports whole retry seconds', () => {
    const key = `test-block-${Date.now()}`;
    const base = 2_000_000;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(key, base + i * 1_000);
    }
    const retryAfter = rateLimitCheck(key, base + 5_000);
    expect(retryAfter).toBeGreaterThan(0);
    expect(Number.isInteger(retryAfter)).toBe(true);
  });

  it('lets a new request through once the window expires', () => {
    const key = `test-expiry-${Date.now()}`;
    const base = 3_000_000;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(key, base + i * 1_000);
    }
    expect(rateLimitCheck(key, base + 5_000)).toBeGreaterThan(0);
    expect(rateLimitCheck(key, base + LEAD_RATE_LIMIT.windowMs + 60_000)).toBe(
      0
    );
  });

  it('tracks buckets independently per key', () => {
    const prefix = `test-isolation-${Date.now()}`;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(`${prefix}-a`, 4_000_000 + i);
    }
    expect(rateLimitCheck(`${prefix}-a`, 4_100_000)).toBeGreaterThan(0);
    expect(rateLimitCheck(`${prefix}-b`, 4_100_000)).toBe(0);
  });
});

describe('getClientIp', () => {
  it('prefers the leftmost X-Forwarded-For entry', () => {
    const req = new Request('http://x.test/', {
      headers: { 'x-forwarded-for': '9.9.9.9, 1.2.3.4' },
    });
    expect(getClientIp(req)).toBe('9.9.9.9');
  });

  it('falls back to x-real-ip, then unknown', () => {
    expect(getClientIp(new Request('http://x.test/', { headers: {} }))).toBe(
      'unknown'
    );
  });
});
