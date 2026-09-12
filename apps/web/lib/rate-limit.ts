// Interim in-memory sliding-window rate limiter for public POST endpoints.
//
// Limits: 5 submissions per 10 minutes per IP per endpoint. A legitimate
// B2B lead flow submits once; the allowance absorbs double-clicks, mobile
// retries and shared office NATs, while bots hammering the endpoint get
// cut off fast.
//
// WARNING: state lives in process memory — it resets on server restart
// and is NOT shared across instances. Move to a shared store (e.g.
// Redis/Upstash) once Phase 16 picks real hosting.
const hitsByKey = new Map<string, number[]>();

export const LEAD_RATE_LIMIT = {
  maxSubmissions: 5,
  windowMs: 10 * 60 * 1000,
} as const;

// Records a hit and returns 0 when allowed, otherwise the whole seconds
// the caller should advertise via `Retry-After`.
export function rateLimitCheck(key: string, now = Date.now()): number {
  const windowStart = now - LEAD_RATE_LIMIT.windowMs;
  const recent = (hitsByKey.get(key) ?? []).filter((t) => t > windowStart);

  if (recent.length >= LEAD_RATE_LIMIT.maxSubmissions) {
    hitsByKey.set(key, recent);
    const retryAfterMs = recent[0] + LEAD_RATE_LIMIT.windowMs - now;
    return Math.max(1, Math.ceil(retryAfterMs / 1000));
  }

  recent.push(now);
  hitsByKey.set(key, recent);
  return 0;
}

// Best-effort client IP for throttling only (never for auth): behind
// Vercel/proxies the leftmost X-Forwarded-For entry is the client. A
// spoofed header only earns the attacker their own bucket.
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for');
  const fromForwarded = forwarded?.split(',')[0]?.trim();
  if (fromForwarded) {
    return fromForwarded;
  }
  return req.headers.get('x-real-ip')?.trim() || 'unknown';
}
