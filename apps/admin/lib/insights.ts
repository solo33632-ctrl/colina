// Pure logic for the insights dashboard (Phase 21c): what the URL asked for,
// which days that covers, and how the trend chart's bars are laid out.
//
// Everything here is deliberately free of Prisma, next-intl and React so it can
// be unit-tested directly (like `rate-limit.ts` and `lead-status.ts`), and so
// the page component is left doing nothing but wiring: parse the query string,
// call the read queries in `@colina/db`, render.

import { utcDayKey } from '@colina/db';
import type { DailyViews, DayRange, SecurityEventType } from '@colina/db';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The date ranges the dashboard offers.
 *
 * A closed set on purpose: the range arrives in the URL, so it is untrusted
 * input, and an allow-list is both the validation and the vocabulary the
 * message files need labels for.
 */
export const RANGE_DAYS = [7, 30] as const;
export type RangeDays = (typeof RANGE_DAYS)[number];
export const DEFAULT_RANGE_DAYS: RangeDays = 7;

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

/**
 * The query string carries the range; anything unrecognised is the default.
 *
 * `Number.parseInt` stops at the first non-digit, so trailing junk is ignored
 * rather than refused — the same leniency `parsePage` in the leads inbox has.
 * It cannot matter here: the parsed number is still checked against the
 * allow-list, so `?range=7days` can only ever mean 7.
 */
export function parseRangeDays(value: string | undefined): RangeDays {
  const parsed = Number.parseInt(value ?? '', 10);
  return (RANGE_DAYS as readonly number[]).includes(parsed)
    ? (parsed as RangeDays)
    : DEFAULT_RANGE_DAYS;
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

/**
 * The `[from, to)` window the last `days` days covers, ending today.
 *
 * Day boundaries come from `utcDayKey` — the same helper the writer in
 * `@colina/db` uses to decide which day a view belongs to, so the dashboard's
 * days and the table's days cannot disagree. `to` is midnight on *tomorrow*, so
 * the window is half-open: exactly the last `days` calendar days, and safe to
 * reuse verbatim for `SecurityEvent.createdAt`, which is a timestamp.
 */
export function rangeWindow(days: RangeDays, now: Date = new Date()): DayRange {
  const today = utcDayKey(now);
  return {
    from: new Date(today.getTime() - (days - 1) * DAY_MS),
    to: new Date(today.getTime() + DAY_MS),
  };
}

/**
 * The series with every day in the window present, zero-filled.
 *
 * `pageViewDailySeries` returns only days that have rows (padding there would
 * hide the difference between "no traffic" and "outside the range"), but a
 * chart that silently skipped days would draw a straight line across a quiet
 * week and read as a trend. The axis has to show the gap.
 *
 * Days are matched on the day key, so a row's own timestamp never has to
 * survive the round trip.
 */
export function dailySeriesForWindow(
  series: DailyViews[],
  window: DayRange
): DailyViews[] {
  const counts = new Map<string, number>();
  for (const point of series) {
    counts.set(utcDayKey(point.date).toISOString(), point.count);
  }

  const days: DailyViews[] = [];
  for (
    let time = window.from.getTime();
    time < window.to.getTime();
    time += DAY_MS
  ) {
    const date = new Date(time);
    days.push({ date, count: counts.get(date.toISOString()) ?? 0 });
  }
  return days;
}

/** Chart geometry, in SVG user units. The SVG scales itself to its container. */
export const TREND = {
  width: 700,
  height: 200,
  paddingX: 10,
  paddingTop: 10,
  /** Room under the plot for the date labels. */
  paddingBottom: 26,
  /** Keeps a 7-day chart from becoming seven enormous slabs. */
  maxBarWidth: 54,
  gap: 6,
} as const;

export type TrendBar = {
  date: Date;
  count: number;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Bar geometry for the trend, oldest day on the left.
 *
 * Zero-count days get a zero-height bar rather than being dropped, so a quiet
 * day still shows its label on the axis. A window with no views at all gives a
 * max of 0, which would divide by zero — every bar is then drawn flat on the
 * baseline, which is the honest rendering of "nothing happened".
 */
export function trendBars(
  points: DailyViews[],
  geometry: typeof TREND = TREND
): TrendBar[] {
  if (points.length === 0) {
    return [];
  }

  const plotWidth = geometry.width - geometry.paddingX * 2;
  const plotHeight =
    geometry.height - geometry.paddingTop - geometry.paddingBottom;
  const slot = plotWidth / points.length;
  const barWidth = Math.max(
    1,
    Math.min(slot - geometry.gap, geometry.maxBarWidth)
  );
  const max = Math.max(...points.map((point) => point.count));
  const round = (value: number) => Math.round(value * 100) / 100;

  return points.map((point, index) => {
    const height = max > 0 ? (point.count / max) * plotHeight : 0;
    return {
      date: point.date,
      count: point.count,
      x: round(geometry.paddingX + slot * index + (slot - barWidth) / 2),
      y: round(geometry.paddingTop + (plotHeight - height)),
      width: round(barWidth),
      height: round(height),
    };
  });
}

/**
 * How many bars to skip between date labels.
 *
 * 30 bars cannot carry 30 labels at phone widths without overlapping into an
 * unreadable smear, so the axis is thinned instead of the chart being shrunk.
 */
export function trendLabelStep(count: number): number {
  if (count <= 8) {
    return 1;
  }
  if (count <= 16) {
    return 2;
  }
  return 5;
}
