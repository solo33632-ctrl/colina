import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// The resolver lives beside the limiter, which imports Prisma; these tests
// never touch the database, so the module boundary is stubbed.
vi.mock('@colina/db', () => ({ prisma: {} }));

import { getClientIp, UNKNOWN_CLIENT_IP } from './rate-limit';

const saved = process.env.CLIENT_IP_HEADER;

beforeEach(() => {
  delete process.env.CLIENT_IP_HEADER;
});

afterEach(() => {
  if (saved === undefined) {
    delete process.env.CLIENT_IP_HEADER;
  } else {
    process.env.CLIENT_IP_HEADER = saved;
  }
});

function headers(record: Record<string, string>) {
  return record as Record<string, unknown>;
}

describe('getClientIp without CLIENT_IP_HEADER', () => {
  it('prefers x-real-ip over x-forwarded-for', () => {
    expect(
      getClientIp(
        headers({
          'x-real-ip': '198.51.100.7',
          'x-forwarded-for': '203.0.113.9, 10.0.0.1',
        })
      )
    ).toBe('198.51.100.7');
  });

  it('uses the RIGHTMOST x-forwarded-for entry, not the spoofed leftmost', () => {
    // A client sending `X-Forwarded-For: 1.2.3.4` through one proxy yields
    // "1.2.3.4, <real peer>"; only the last entry was appended by the proxy.
    expect(
      getClientIp(
        headers({ 'x-forwarded-for': '1.2.3.4, 198.51.100.9' })
      )
    ).toBe('198.51.100.9');
  });

  it('trims the rightmost entry and accepts IPv6', () => {
    expect(
      getClientIp(
        headers({
          'x-forwarded-for': '203.0.113.9 ,  2001:db8::1 ',
        })
      )
    ).toBe('2001:db8::1');
  });

  it('falls back to unknown when no IP header is present', () => {
    expect(getClientIp(headers({}))).toBe(UNKNOWN_CLIENT_IP);
    expect(getClientIp(undefined)).toBe(UNKNOWN_CLIENT_IP);
  });

  it('returns unknown for a malformed x-real-ip instead of falling through', () => {
    expect(
      getClientIp(
        headers({
          'x-real-ip': 'not-an-ip',
          'x-forwarded-for': '198.51.100.9',
        })
      )
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it('returns unknown for a malformed rightmost forwarded entry', () => {
    expect(
      getClientIp(
        headers({ 'x-forwarded-for': '198.51.100.9, definitely-not-an-ip' })
      )
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it('supports Fetch Headers as well as plain records', () => {
    expect(
      getClientIp(
        new Headers({ 'x-covered-for': 'ignored', 'x-real-ip': '203.0.113.4' })
      )
    ).toBe('203.0.113.4');
  });
});

describe('getClientIp with CLIENT_IP_HEADER', () => {
  it('reads only the configured header and ignores spoofed XFF/x-real-ip', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
    expect(
      getClientIp(
        headers({
          'cf-connecting-ip': '198.51.100.20',
          'x-forwarded-for': '1.2.3.4, 5.6.7.8',
          'x-real-ip': '203.0.113.30',
        })
      )
    ).toBe('198.51.100.20');
  });

  it('uses the first value of the configured header', () => {
    process.env.CLIENT_IP_HEADER = 'x-platform-client-ip';
    expect(
      getClientIp(
        headers({
          'x-platform-client-ip': '198.51.100.21, 203.0.113.44',
        })
      )
    ).toBe('198.51.100.21');
  });

  it('matches the configured header case-insensitively', () => {
    process.env.CLIENT_IP_HEADER = 'CF-Connecting-IP';
    expect(
      getClientIp(headers({ 'cf-connecting-ip': '203.0.113.5' }))
    ).toBe('203.0.113.5');
  });

  it('does not fall back to other headers when the configured value is invalid', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
    expect(
      getClientIp(
        headers({
          'cf-connecting-ip': 'not-an-ip',
          'x-real-ip': '198.51.100.7',
          'x-forwarded-for': '198.51.100.8',
        })
      )
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it('returns unknown when the configured header is absent', () => {
    process.env.CLIENT_IP_HEADER = 'cf-connecting-ip';
    expect(
      getClientIp(headers({ 'x-real-ip': '198.51.100.7' }))
    ).toBe(UNKNOWN_CLIENT_IP);
  });

  it('accepts an array-valued plain record (first value)', () => {
    process.env.CLIENT_IP_HEADER = 'x-real-ip';
    expect(
      getClientIp({
        'x-real-ip': ['198.51.100.22', '203.0.113.45'],
      } as Record<string, unknown>)
    ).toBe('198.51.100.22');
  });
});
