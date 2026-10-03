// Privacy-respecting page-view counting (Phase 21b).
//
// Best-effort by contract, exactly like `logSecurityEvent` in
// `security-events.ts` and `sendLeadNotification` in apps/web: by the time a
// view is described the response is already decided, so recording it must
// never change or delay what the visitor sees. Every failure is caught and
// only logged server-side. A view that cannot be counted costs the dashboard
// one number, never a page load.
//
// This module is storage only. *Which* requests count as a view — the crawler
// filter, the path/locale validation, the rate limit — is apps/web policy and
// deliberately lives with the endpoint that receives the request, so this file
// stays a single writer both apps (and any future reader) can share.

import { prisma } from './index';

/** Longest `path` we will store. Longest real route is far below this; the cap
 *  only stops a future caller from turning the column into free text. */
const MAX_PATH_LENGTH = 200;

/** Longest `locale` we will store. Both real locales are 2 characters. */
const MAX_LOCALE_LENGTH = 8;

/**
 * The calendar day a view belongs to, as UTC midnight.
 *
 * PostgreSQL `date` has no timezone, so the value we hand Prisma has to be an
 * unambiguous instant. Taking the *server's* Y/M/D and rebuilding it as UTC
 * midnight means the stored day is the server's calendar day regardless of the
 * process timezone (`new Date(y, m, d)` would store 22:00 the previous day for
 * a UTC server east of Greenwich).
 *
 * Server day, never visitor day: deriving the day from the visitor would mean
 * storing something about them, which is the opposite of what this table is
 * for. A visit at 23:30 Cairo time lands on the same row as one at 01:30.
 */
function currentUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
}

export type RecordPageViewResult = 'counted' | 'skipped';

/**
 * Adds one view to today's row for `path` + `locale`, creating that row on the
 * first view of the day.
 *
 * Atomic by construction: a single `upsert` whose `update` is `increment: 1`,
 * i.e. the arithmetic happens in the database. The read-then-write version of
 * this ("find the row, add one, save it") loses counts whenever two requests
 * for the same page overlap, which on a popular page is most of them.
 *
 * Never throws. Resolves `'skipped'` when there is nothing to store (a blank
 * path, or one past the cap) and `'counted'` otherwise; the caller cannot tell
 * a successful write from a swallowed failure by return value alone, which is
 * deliberate — a dropped view is never worth an error path in a request that
 * has already been answered.
 */
export async function recordPageView(
  path: string,
  locale: string,
  now?: Date
): Promise<RecordPageViewResult> {
  const trimmedPath = path?.trim();
  const trimmedLocale = locale?.trim();
  if (!trimmedPath || !trimmedLocale) {
    return 'skipped';
  }

  // Normalised once and used in BOTH the unique key and the insert: the create
  // branch must store exactly the value the upsert matched on, or the next
  // request would look for a different key and open a second row for one page.
  const storedPath = trimmedPath.slice(0, MAX_PATH_LENGTH);
  const storedLocale = trimmedLocale.slice(0, MAX_LOCALE_LENGTH);
  const date = currentUtcDay(now);

  try {
    await prisma.pageViewDaily.upsert({
      where: {
        date_path_locale: { date, path: storedPath, locale: storedLocale },
      },
      create: { date, path: storedPath, locale: storedLocale, count: 1 },
      update: { count: { increment: 1 } },
    });
    return 'counted';
  } catch (error) {
    console.error('[page-view] write failed:', error);
    return 'skipped';
  }
}
