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

/**
 * A calendar day as the `date` column stores it: a UTC-midnight `Date`.
 *
 * Exported because a reader has to build day boundaries in exactly this
 * encoding to select the rows a writer wrote. `currentUtcDay` above is the same
 * rule for "today".
 */
export function utcDayKey(date: Date): Date {
  return new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())
  );
}

/**
 * A half-open window of whole days: `[from, to)`.
 *
 * Callers pass day keys (`utcDayKey`), so `from` is midnight on the first day
 * included and `to` midnight on the day *after* the last one. Half-open rather
 * than inclusive-end because the same window also filters
 * `SecurityEvent.createdAt`, which is a timestamp and would otherwise need an
 * end-of-day guess.
 */
export type DayRange = {
  from: Date;
  to: Date;
};

export type DailyViews = {
  date: Date;
  count: number;
};

export type TopPageViews = {
  path: string;
  total: number;
  /** Views per locale for this path; keys are locale codes ('ar', 'en'). */
  byLocale: Record<string, number>;
};

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

// ---------------------------------------------------------------------------
// Read side (the admin insights dashboard).
//
// Every query here aggregates in the database (`aggregate` / `groupBy`) and
// returns rows already reduced to the numbers the dashboard draws. The table is
// pre-aggregated per day, so a 30-day window is at most a few hundred rows
// before grouping and a handful after — but the point is that nothing scales
// with the traffic it summarises: no "fetch every row and sum it in Node".
// ---------------------------------------------------------------------------

/**
 * Total views across the window, as one number.
 *
 * `_sum` returns null for an empty set, which is 0 views, not a missing value.
 */
export async function pageViewTotal(range: DayRange): Promise<number> {
  const result = await prisma.pageViewDaily.aggregate({
    where: { date: { gte: range.from, lt: range.to } },
    _sum: { count: true },
  });
  return result._sum.count ?? 0;
}

/**
 * Views per day, ascending, for the days that have rows.
 *
 * Deliberately does NOT pad the gaps: days with no rows are simply absent, and
 * the caller decides how to render an empty day (the dashboard's trend chart
 * does, because it needs every day on its axis). Padding here would hide the
 * difference between "no traffic" and "not in the selected range".
 */
export async function pageViewDailySeries(
  range: DayRange
): Promise<DailyViews[]> {
  const grouped = await prisma.pageViewDaily.groupBy({
    by: ['date'],
    where: { date: { gte: range.from, lt: range.to } },
    _sum: { count: true },
    orderBy: { date: 'asc' },
  });
  return grouped.map((row) => ({
    date: row.date,
    count: row._sum.count ?? 0,
  }));
}

/**
 * The `limit` most-viewed paths in the window, with a per-locale split.
 *
 * Two `groupBy` calls, both in SQL: the first ranks paths by their summed
 * count, the second breaks just those paths down by locale. The second query is
 * bounded by `limit` paths (times the number of locales), so the locale
 * breakdown never widens into "every path ever seen".
 *
 * Ties are broken by path so the order is stable between two loads of the same
 * data — an operator comparing two screenshots should not see rows swap places.
 */
export async function topPageViews(
  range: DayRange,
  limit: number
): Promise<TopPageViews[]> {
  if (limit <= 0) {
    return [];
  }

  const where = { date: { gte: range.from, lt: range.to } };
  const ranked = await prisma.pageViewDaily.groupBy({
    by: ['path'],
    where,
    _sum: { count: true },
    orderBy: [{ _sum: { count: 'desc' } }, { path: 'asc' }],
    take: limit,
  });

  const byLocale = await prisma.pageViewDaily.groupBy({
    by: ['path', 'locale'],
    where: { ...where, path: { in: ranked.map((row) => row.path) } },
    _sum: { count: true },
  });

  return ranked.map((row) => {
    const perLocale: Record<string, number> = {};
    for (const split of byLocale) {
      if (split.path === row.path) {
        perLocale[split.locale] = split._sum.count ?? 0;
      }
    }
    return { path: row.path, total: row._sum.count ?? 0, byLocale: perLocale };
  });
}
