// Login-tuned copy of the Phase 8 web limiter mechanism
// (`apps/web/lib/rate-limit.ts`). Duplicated rather than shared on purpose:
// the policies differ per endpoint purpose (credential-stuffing defense
// here vs. lead-spam throttling there), and each file documents its own
// numbers. Same interim caveats apply: in-memory only, resets on restart,
// single-instance — move to a shared store (Redis/Upstash) in Phase 16.

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

const hitsByKey = new Map<string, number[]>();

// Records a hit and returns 0 when allowed, otherwise the whole seconds
// the caller should advertise via `Retry-After`.
export function rateLimitCheck(
  key: string,
  config: RateLimitConfig,
  now = Date.now()
): number {
  const windowStart = now - config.windowMs;
  const recent = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= config.maxAttempts) {
    hitsByKey.set(key, recent);
    const retryAfterMs = recent[0] + config.windowMs - now;
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  recent.push(now);
  hitsByKey.set(key, recent);
  return 0;
}

// Best-effort client IP for throttling only (never for auth).
//
// Accepts both Fetch `Headers` (route handlers) and plain header records:
// next-auth's `authorize()` receives `RequestInternal`, whose `headers`
// is `Record<string, any>` — calling `.get()` on it would throw and break
// every login, so both shapes are handled here.
//
// X-Forwarded-For is only meaningful behind a reverse proxy that
// OVERWRITES it (e.g. Vercel, which guarantees the leftmost entry). On
// unprotected hosting this header is fully attacker-controlled and the
// limiter is trivially bypassable by rotating it — flagged for the real
// fix in Phase 16 (trust only the platform's guaranteed client-IP
// header). See SECURITY.md.
export function getClientIp(
  headers: Headers | Record<string, unknown> | undefined
): string {
  const get = (name: string): string | null => {
    if (!headers) {
      return null;
    }
    if (typeof (headers as Headers).get === 'function') {
      return (headers as Headers).get(name);
    }
    const record = headers as Record<string, unknown>;
    const value = record[name] ?? record[name.toLowerCase()];
    if (typeof value === 'string') {
      return value;
    }
    if (Array.isArray(value) && typeof value[0] === 'string') {
      return value[0];
    }
    return null;
  };

  const forwarded = get('x-forwarded-for');
  const fromForwarded = forwarded?.split(',')[0]?.trim();
  if (fromForwarded) {
    return fromForwarded;
  }
  return get('x-real-ip')?.trim() || 'unknown';
}
