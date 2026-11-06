// Security/abuse event logging (Phase 21a).
//
// Both deployments write here: `apps/web` logs blocked public form posts,
// `apps/admin` logs rejected admin sign-ins. Neither needs anything extra to
// do it — the shared client in `index.ts` is already the project's cross-app
// write path (apps/web writes ContactMessage/MaintenanceRequest, apps/admin
// writes AuditLog, both through this package). So the event writer lives
// here, beside the client, instead of being duplicated per app.
//
// Best-effort by contract: a request has already been *decided* by the time
// it is described, so recording the decision must never change the outcome.
// Every failure is caught and only logged server-side — the same principle
// the lead-notification email follows. A row that cannot be written costs an
// investigator one event, never a visitor's submission or a login.

import { prisma } from './index';
import type { SecurityEventType } from './prisma/generated/client';

// Longest `source` we will store. The values are code-owned and short
// ("contact", "admin-login"); the cap only stops a future caller from
// turning this column into free text.
const MAX_SOURCE_LENGTH = 64;

// Longest `ip` we will store. A real address is well under this, but
// X-Forwarded-For is attacker-controlled on unprotected hosting (see
// SECURITY.md), so a spoofed value can be any length at all.
const MAX_IP_LENGTH = 64;

// Longest `detail` we will store. `detail` is the one field that can carry
// attacker-supplied text (the honeypot value, an attempted email), and this
// table is append-only, so an unbounded value would let one hostile request
// store as much as it likes. 200 characters is enough for every detail this
// project writes and small enough that a reviewer reads the whole cell.
const MAX_DETAIL_LENGTH = 200;

export type SecurityEventInput = {
  type: SecurityEventType;
  source: string;
  // Best-effort client IP, exactly as the caller's `getClientIp` returned it
  // (including its `'unknown'` fallback — an explicit "we had no address" is
  // more useful to a reviewer than NULL). null/undefined/blank becomes NULL.
  ip?: string | null;
  detail?: string | null;
};

// Trims, then hard-caps. Empty/whitespace-only input becomes null so the
// dashboard can filter on "no detail" without also matching blanks.
function normalize(value: string | null | undefined, maxLength: number) {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.length > maxLength ? trimmed.slice(0, maxLength) : trimmed;
}

/**
 * Records one blocked/suspicious event. Returns whether the row landed, so
 * a caller could log a secondary signal — every current caller ignores the
 * result, which is the point: logging is never part of the response.
 *
 * Never throws.
 */
export async function logSecurityEvent(
  input: SecurityEventInput
): Promise<boolean> {
  try {
    await prisma.securityEvent.create({
      data: {
        type: input.type,
        // `source` is NOT NULL, so an empty one still has to be written;
        // 'unknown' mirrors the rate limiter's own fallback rather than
        // inventing a second way of saying "no source".
        source: normalize(input.source, MAX_SOURCE_LENGTH) ?? 'unknown',
        ip: normalize(input.ip, MAX_IP_LENGTH),
        detail: normalize(input.detail, MAX_DETAIL_LENGTH),
      },
    });
    return true;
  } catch (error) {
    console.error('[security-event] write failed:', error);
    return false;
  }
}
