// Interim in-memory sliding-window rate limiter for public POST endpoints.
//
// Two policies live here, each documented at its own constant: the lead forms
// (5 per 10 minutes per IP per endpoint) and page-view beacons (600, see
// PAGE_VIEW_RATE_LIMIT).
//
// WARNING: state lives in process memory — it resets on server restart
// and is NOT shared across instances. Move to a shared store (e.g.
// Redis/Upstash) once Phase 16 picks real hosting.
const hitsByKey = new Map<string, number[]>();

// Lead forms: 5 submissions per 10 minutes per IP per endpoint. A legitimate
// B2B lead flow submits once; the allowance absorbs double-clicks, mobile
// retries and shared office NATs, while bots hammering the endpoint get
// cut off fast.
export const LEAD_RATE_LIMIT = {
  maxSubmissions: 5,
  windowMs: 10 * 60 * 1000,
} as const;

// Page views (Phase 21b): 600 per 10 minutes per IP. Far looser than the lead
// limit on purpose — this endpoint is hit by ordinary browsing, so a tight
// limit would drop real visitors' counts (a fast clicker, or one office behind
// a shared NAT) while stopping a script no faster than the lead limit does. The
// abuse being bounded here is "inflate a counter", which costs one indexed
// upsert per request; 600/10min leaves ample room for heavy human browsing and
// still refuses an unattended flood. Refused requests are simply not counted:
// no row, and deliberately no SecurityEvent either, since a crawler hammering
// this endpoint is not the abuse the security log is for.
export const PAGE_VIEW_RATE_LIMIT = {
  maxSubmissions: 600,
  windowMs: 10 * 60 * 1000,
} as const;

export type RateLimitConfig = {
  maxSubmissions: number;
  windowMs: number;
};

// Records a hit and returns 0 when allowed, otherwise the whole seconds
// the caller should advertise via `Retry-After`. Defaults to the lead policy so
// the two form routes keep calling it with just a bucket key.
export function rateLimitCheck(
  key: string,
  config: RateLimitConfig = LEAD_RATE_LIMIT,
  now = Date.now()
): number {
  const windowStart = now - config.windowMs;
  const recent = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= config.maxSubmissions) {
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
// X-Forwarded-For is only meaningful behind a reverse proxy that
// OVERWRITES it (e.g. Vercel, which guarantees the leftmost entry).
// On unprotected hosting this header is fully attacker-controlled and
// the limiter is trivially bypassable by rotating it — flag for the real
// fix in Phase 16 (trust only the platform's guaranteed client-IP
// header). A spoofed value otherwise just earns the attacker their own
// bucket, which is harmless for throttling purposes.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const fromForwarded = forwarded?.split(',')[0]?.trim();
  if (fromForwarded) {
    return fromForwarded;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
