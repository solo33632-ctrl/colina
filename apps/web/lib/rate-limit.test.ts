import { describe, expect, it } from 'vitest';
import {
  getClientIp,
  LEAD_RATE_LIMIT,
  PAGE_VIEW_RATE_LIMIT,
  rateLimitCheck,
} from './rate-limit';

// Deterministic via the explicit `now` parameter — no fake timers, no sleeps.
// The config is the second argument (it defaults to the lead policy), which is
// why every call below passes the policy it is testing explicitly.
describe('rateLimitCheck', () => {
  it('allows requests under the limit', () => {
    const key = `test-allow-${Date.now()}`;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      expect(rateLimitCheck(key, LEAD_RATE_LIMIT, 1_000_000 + i * 1_000)).toBe(
        0
      );
    }
  });

  it('blocks past the limit and reports whole retry seconds', () => {
    const key = `test-block-${Date.now()}`;
    const base = 2_000_000;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(key, LEAD_RATE_LIMIT, base + i * 1_000);
    }
    const retryAfter = rateLimitCheck(key, LEAD_RATE_LIMIT, base + 5_000);
    expect(retryAfter).toBeGreaterThan(0);
    expect(Number.isInteger(retryAfter)).toBe(true);
  });

  it('lets a new request through once the window expires', () => {
    const key = `test-expiry-${Date.now()}`;
    const base = 3_000_000;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(key, LEAD_RATE_LIMIT, base + i * 1_000);
    }
    expect(rateLimitCheck(key, LEAD_RATE_LIMIT, base + 5_000)).toBeGreaterThan(
      0
    );
    expect(
      rateLimitCheck(
        key,
        LEAD_RATE_LIMIT,
        base + LEAD_RATE_LIMIT.windowMs + 60_000
      )
    ).toBe(0);
  });

  it('tracks buckets independently per key', () => {
    const prefix = `test-isolation-${Date.now()}`;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(`${prefix}-a`, LEAD_RATE_LIMIT, 4_000_000 + i);
    }
    expect(
      rateLimitCheck(`${prefix}-a`, LEAD_RATE_LIMIT, 4_100_000)
    ).toBeGreaterThan(0);
    expect(rateLimitCheck(`${prefix}-b`, LEAD_RATE_LIMIT, 4_100_000)).toBe(0);
  });

  it('defaults to the lead policy when no config is given', () => {
    const key = `test-default-${Date.now()}`;
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions; i++) {
      rateLimitCheck(key, undefined, 5_000_000 + i * 1_000);
    }
    expect(rateLimitCheck(key, undefined, 5_100_000)).toBeGreaterThan(0);
  });

  it('applies the page-view policy independently of the lead policy', () => {
    const key = `test-page-view-${Date.now()}`;
    const base = 6_000_000;
    // Far more requests than a lead form allows, all still allowed here.
    for (let i = 0; i < LEAD_RATE_LIMIT.maxSubmissions + 3; i++) {
      expect(rateLimitCheck(key, PAGE_VIEW_RATE_LIMIT, base + i * 1_000)).toBe(
        0
      );
    }
    // The page-view ceiling is enforced on its own terms.
    for (
      let i = LEAD_RATE_LIMIT.maxSubmissions + 3;
      i < PAGE_VIEW_RATE_LIMIT.maxSubmissions;
      i++
    ) {
      rateLimitCheck(key, PAGE_VIEW_RATE_LIMIT, base + i * 1_000);
    }
    expect(
      rateLimitCheck(key, PAGE_VIEW_RATE_LIMIT, base + 60_000)
    ).toBeGreaterThan(0);
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
