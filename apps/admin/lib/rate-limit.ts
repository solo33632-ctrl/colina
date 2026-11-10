// Admin rate limiting, durable in PostgreSQL (Stage 2c).
//
// The policy numbers are unchanged from the in-memory limiter. What changed
// is the storage: buckets live in `RateLimitBucket`, so a restart, a second
// instance or a load-balanced pair shares the same counts. Each check is one
// atomic INSERT ... ON CONFLICT ... RETURNING statement; no read-then-write
// race exists between concurrent requests.
//
// Windows are fixed (epoch-aligned multiples of `windowMs`). The response
// advertises whole seconds until the current window ends, exactly as before.
//
// Failure policy: if the database is unreachable the limiter FAILS CLOSED
// and logs server-side only. Login keeps its generic credential error;
// forgot/reset keep their generic `rate_limited` answer. A limiter outage
// must never become an unlimited credential-stuffing window.
//
// Keys are SHA-256 hashes of a namespaced value (`colina-rate-limit:` plus
// the caller's `login:` / `forgot:` / `reset:` + IP), so the table never
// stores a raw IP address or email. Expired windows are deleted
// opportunistically on ~1% of writes; there is no scheduler and no cleanup
// work on the other 99%.

import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { prisma } from '@colina/db';

// Login: 10 attempts per 15 minutes per IP. A legitimate admin mistypes a
// few times; 10 absorbs that without locking anyone out (no lockout also
// means no user-enumeration or lockout-as-DoS vector), while 40 tries per
// hour per IP makes credential stuffing impractical.
export const LOGIN_RATE_LIMIT = {
  maxAttempts: 10,
  windowMs: 15 * 60 * 1000,
} as const;

// Password-reset requests send email (abuse = inbox-bombing the victim),
// so this bucket is tighter: 5 per 15 minutes per IP.
export const PASSWORD_RESET_RATE_LIMIT = {
  maxAttempts: 5,
  windowMs: 15 * 60 * 1000,
} as const;

export type RateLimitConfig = {
  maxAttempts: number;
  windowMs: number;
};

// Fraction of checks that also sweep old windows. Low enough that the
// request path is unaffected in practice, frequent enough that the table
// cannot grow without bound on a busy deployment.
const CLEANUP_PROBABILITY = 0.01;

const KEY_NAMESPACE = 'colina-rate-limit:';

/** Never store the raw IP/email the caller uses as a limiter key. */
function hashKey(key: string): string {
  return createHash('sha256').update(`${KEY_NAMESPACE}${key}`).digest('hex');
}

function currentWindowStart(now: number, windowMs: number): Date {
  return new Date(Math.floor(now / windowMs) * windowMs);
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function deleteExpiredBuckets(windowStart: Date): Promise<void> {
  try {
    await prisma.rateLimitBucket.deleteMany({
      where: { windowStart: { lt: windowStart } },
    });
  } catch (error) {
    // Housekeeping only: a failure here must not change the request's
    // allow/deny decision, which was already made by the atomic upsert.
    console.error('[rate-limit] cleanup failed:', errorMessage(error));
  }
}

/**
 * Records a hit and returns 0 when allowed, otherwise the whole seconds the
 * caller should advertise via `Retry-After`.
 *
 * `now` is injectable only for deterministic tests; production callers use
 * the default.
 */
export async function rateLimitCheck(
  key: string,
  config: RateLimitConfig,
  now = Date.now()
): Promise<number> {
  const windowStart = currentWindowStart(now, config.windowMs);
  const hashedKey = hashKey(key);

  let count: number;
  try {
    // ONE statement: concurrent requests in the same window serialize on the
    // primary-key conflict target, so no increment can be lost.
    const rows = await prisma.$queryRaw<Array<{ count: number }>>`
      INSERT INTO "RateLimitBucket" ("key", "windowStart", "count")
      VALUES (${hashedKey}, ${windowStart}, 1)
      ON CONFLICT ("key", "windowStart")
      DO UPDATE SET "count" = "RateLimitBucket"."count" + 1
      RETURNING "count"
    `;
    count = Number(rows[0]?.count ?? 0);
  } catch (error) {
    console.error(
      '[rate-limit] durable check failed; failing closed:',
      errorMessage(error)
    );
    // Treat the request as if the current window were exhausted. The caller
    // answers with its existing generic blocked response and no detail.
    return Math.max(1, Math.ceil(config.windowMs / 1000));
  }

  if (Math.random() < CLEANUP_PROBABILITY) {
    await deleteExpiredBuckets(windowStart);
  }

  if (count > config.maxAttempts) {
    const retryAfterMs = windowStart.getTime() + config.windowMs - now;
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  return 0;
}

// Best-effort client IP for throttling only (never for auth).
//
// Trust model (Stage 2c): the old resolver took the LEFTMOST
// `x-forwarded-for` entry, which is whatever the client sent unless a proxy
// overwrites the header — so rotating a spoofed value bypassed the limiter.
// The rules now are:
//
//   1. If `CLIENT_IP_HEADER` is set, read ONLY that header. It must name a
//      single header that a trusted platform proxy sets/overwrites (e.g.
//      `cf-connecting-ip` on Cloudflare). Its first value is used; every
//      other IP header is ignored.
//   2. Otherwise use `x-real-ip` when present.
//   3. Otherwise use the RIGHTMOST `x-forwarded-for` entry — the one the
//      nearest proxy appended, not the client-supplied leftmost entries.
//   4. Otherwise, or when the chosen value is not a valid IP, `'unknown'`.
//
// Never leave `CLIENT_IP_HEADER` unset on hosting where clients can send
// arbitrary headers and no proxy overwrites x-real-ip/x-forwarded-for.
// Documented in SECURITY.md and .env.example.
//
// Accepts both Fetch `Headers` (route handlers) and plain header records:
// next-auth's `authorize()` receives `RequestInternal`, whose `headers`
// is `Record<string, any>` — calling `.get()` on it would throw and break
// every login, so both shapes are handled here.
export const UNKNOWN_CLIENT_IP = 'unknown';

function readHeader(
  headers: Headers | Record<string, unknown> | undefined,
  name: string
): string | null {
  if (!headers) {
    return null;
  }
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name);
  }
  const record = headers as Record<string, unknown>;
  const value = record[name.toLowerCase()] ?? record[name];
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value) && typeof value[0] === 'string') {
    return value[0];
  }
  return null;
}

/** First comma-separated value, trimmed; empty becomes null. */
function firstValue(value: string | null): string | null {
  const first = value?.split(',')[0]?.trim();
  return first || null;
}

export function getClientIp(
  headers: Headers | Record<string, unknown> | undefined
): string {
  const configuredHeader = process.env.CLIENT_IP_HEADER?.trim();

  if (configuredHeader) {
    // One header, one value. If the platform value is malformed, fail to
    // `unknown` rather than falling back to a client-spoofable header.
    const value = firstValue(readHeader(headers, configuredHeader));
    return value && isIP(value) !== 0 ? value : UNKNOWN_CLIENT_IP;
  }

  const realIp = firstValue(readHeader(headers, 'x-real-ip'));
  if (realIp) {
    return isIP(realIp) !== 0 ? realIp : UNKNOWN_CLIENT_IP;
  }

  const forwarded = readHeader(headers, 'x-forwarded-for');
  const rightmost = forwarded?.split(',').at(-1)?.trim();
  return rightmost && isIP(rightmost) !== 0
    ? rightmost
    : UNKNOWN_CLIENT_IP;
}
