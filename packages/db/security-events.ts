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
import { SecurityEventType as SecurityEventTypes } from './prisma/generated/client';
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

// ---------------------------------------------------------------------------
// Read side (the admin insights dashboard).
//
// This table is the one that grows without bound: every refused public form
// post and every rejected admin sign-in appends a row, forever. So the reader
// counts in the database and pages with `skip`/`take` over an index-backed
// order — it never loads the table to count it in Node.
// ---------------------------------------------------------------------------

/**
 * Half-open window `[from, to)`, in instants.
 *
 * Shares its shape with `page-views`' `DayRange` on purpose: the dashboard has
 * one date selector and both sections answer from it. The caller builds the
 * bounds from day keys, which is why an event recorded at 23:59 on the last day
 * of the window is inside it and one at 00:00 the next morning is not.
 */
export type SecurityEventRange = {
  from: Date;
  to: Date;
};

/** A row as the dashboard lists it: exactly the five columns it shows. */
export type SecurityEventListRow = {
  id: string;
  type: SecurityEventType;
  source: string;
  ip: string | null;
  detail: string | null;
  createdAt: Date;
};

export type SecurityEventPage = {
  rows: SecurityEventListRow[];
  /** Total matching rows in the window, for the page count. */
  total: number;
};

function rangeWhere(range: SecurityEventRange, type?: SecurityEventType) {
  return {
    createdAt: { gte: range.from, lt: range.to },
    ...(type ? { type } : {}),
  };
}

/**
 * How many events of each type fall in the window, keyed by every type the
 * schema knows — including types with a count of 0, so a caller can render one
 * tile per type without inventing the list and without a type silently
 * disappearing from the dashboard when the enum grows.
 */
export async function countSecurityEventsByType(
  range: SecurityEventRange,
  type?: SecurityEventType
): Promise<Record<SecurityEventType, number>> {
  const grouped = await prisma.securityEvent.groupBy({
    by: ['type'],
    where: rangeWhere(range, type),
    _count: { _all: true },
  });

  const counts = Object.fromEntries(
    Object.keys(SecurityEventTypes).map((key) => [key, 0])
  ) as Record<SecurityEventType, number>;
  for (const row of grouped) {
    counts[row.type] = row._count._all;
  }
  return counts;
}

/**
 * One page of raw events, newest first, plus the total number of matches.
 *
 * `orderBy: { createdAt: 'desc' }` rides the `@@index([createdAt])` the schema
 * already declares, which is what keeps a deep page cheap on a table that only
 * grows.
 */
export async function listSecurityEvents({
  range,
  type,
  page,
  pageSize,
}: {
  range: SecurityEventRange;
  type?: SecurityEventType;
  /** 1-based. Clamped to >= 1 here so a caller cannot ask for a negative
   *  offset by passing 0 or -1 straight through. */
  page: number;
  pageSize: number;
}): Promise<SecurityEventPage> {
  const where = rangeWhere(range, type);
  const safePage = Number.isFinite(page) && page > 0 ? Math.floor(page) : 1;

  const [rows, total] = await Promise.all([
    prisma.securityEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        type: true,
        source: true,
        ip: true,
        detail: true,
        createdAt: true,
      },
    }),
    prisma.securityEvent.count({ where }),
  ]);

  return { rows, total };
}
