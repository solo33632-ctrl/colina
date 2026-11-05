// Pure logic for the security half of the insights dashboard (Phase 21c):
// what the URL asked for and how the event table is paged.
//
// Everything here is deliberately free of Prisma, next-intl and React so it can
// be unit-tested directly (like `rate-limit.ts` and `lead-status.ts`), and so
// the page component is left doing nothing but wiring: parse the query string,
// call the read queries in `@colina/db`, render.
//
// The traffic data (ranges, windows, aggregation, chart inputs) lives in
// `insights-traffic.ts`, which both the traffic section and the security
// section's shared range use.

import type { SecurityEventType } from '@colina/db';

/**
 * Stored `SecurityEvent.type` codes, in the order the dashboard shows them.
 *
 * These are never displayed — they are what the `?type=` filter carries and
 * what the `type` column holds. The visible label for each is
 * `Insights.eventTypes.*`, and `messages.test.ts` fails the build if a code
 * and a label ever drift apart (the same guard `lead-status.ts` has).
 */
export const SECURITY_EVENT_TYPES = [
  'RATE_LIMITED',
  'HONEYPOT_CAUGHT',
  'LOGIN_FAILED',
] as const;

export function isSecurityEventType(value: string): value is SecurityEventType {
  return (SECURITY_EVENT_TYPES as readonly string[]).includes(value);
}

/** No `?type=` means "every type", so the filter's off state is `undefined`. */
export function parseEventType(
  value: string | undefined
): SecurityEventType | undefined {
  return value !== undefined && isSecurityEventType(value) ? value : undefined;
}

/** 1-based page number; junk and non-positive values fall back to the first. */
export function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

/** A page number past the end (a stale link, a shrinking result set) is pinned
 *  to the last real page rather than showing an empty table. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}
