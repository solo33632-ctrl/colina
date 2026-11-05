// Traffic data for the insights dashboard.
//
// The page-view table is already pre-aggregated per day/path/locale, and every
// query here reduces it further in SQL (`aggregate` / `groupBy`). No function
// in this file loads the underlying rows: the dashboard only ever sees totals,
// daily points, path totals and locale totals. That also keeps the privacy
// promise of `PageViewDaily` visible in the code — there is no per-visitor row
// to read, and nothing here invents one.

import { prisma, utcDayKey } from '@colina/db';
import type { DailyViews, DayRange } from '@colina/db';

const DAY_MS = 24 * 60 * 60 * 1000;

/** The traffic ranges offered by the dashboard, in display order. */
export const TRAFFIC_RANGE_DAYS = [7, 30, 90] as const;
export type TrafficRangeDays = (typeof TRAFFIC_RANGE_DAYS)[number];
export const DEFAULT_TRAFFIC_RANGE_DAYS: TrafficRangeDays = 30;

/**
 * The URL is untrusted input, so the parsed number is checked against the
 * closed list. Trailing junk is read leniently (`30days` means 30), exactly as
 * `parsePage` and the old range parser did.
 */
export function parseTrafficRange(value: string | undefined): TrafficRangeDays {
  const parsed = Number.parseInt(value ?? '', 10);
  return (TRAFFIC_RANGE_DAYS as readonly number[]).includes(parsed)
    ? (parsed as TrafficRangeDays)
    : DEFAULT_TRAFFIC_RANGE_DAYS;
}

/**
 * The half-open window of whole days ending today, in `utcDayKey` encoding.
 * Shared with the security section's timestamp filter.
 */
export function windowForDays(days: number, now: Date = new Date()): DayRange {
  const today = utcDayKey(now);
  return {
    from: new Date(today.getTime() - (days - 1) * DAY_MS),
    to: new Date(today.getTime() + DAY_MS),
  };
}

export type TrafficWindows = {
  current: DayRange;
  previous: DayRange;
};

/**
 * The selected window plus the immediately preceding window of equal length.
 * The previous window ends exactly where the current one starts, so no day is
 * counted twice and no day falls between them.
 */
export function trafficWindows(
  days: TrafficRangeDays,
  now: Date = new Date()
): TrafficWindows {
  const current = windowForDays(days, now);
  return {
    current,
    previous: {
      from: new Date(current.from.getTime() - days * DAY_MS),
      to: current.from,
    },
  };
}

/**
 * Percentage change against the previous window, rounded to a whole percent.
 * `null` means "cannot be computed" (nothing to compare against), not "no
 * change": zero previous views must render as "No previous data", never as a
 * fake -100% or 0%.
 */
export function percentChange(
  current: number,
  previous: number
): number | null {
  if (previous === 0) {
    return null;
  }
  return Math.round(((current - previous) / previous) * 100);
}

/**
 * The series with every day in the window present, ascending, zero-filled.
 * The database deliberately returns only days that have rows; a chart that
 * skipped a quiet day would draw a straight line across it and imply traffic
 * that never happened.
 */
export function padDailySeries(
  series: DailyViews[],
  window: DayRange
): DailyViews[] {
  const counts = new Map<number, number>();
  for (const point of series) {
    counts.set(utcDayKey(point.date).getTime(), point.count);
  }

  const days: DailyViews[] = [];
  for (
    let time = window.from.getTime();
    time < window.to.getTime();
    time += DAY_MS
  ) {
    const date = new Date(time);
    days.push({ date, count: counts.get(date.getTime()) ?? 0 });
  }
  return days;
}

// ---------------------------------------------------------------------------
// Sections and friendly labels
// ---------------------------------------------------------------------------

export const TRAFFIC_SECTIONS = [
  'home',
  'machines',
  'categories',
  'maintenance',
  'contact',
  'other',
] as const;
export type TrafficSection = (typeof TRAFFIC_SECTIONS)[number];

function pathSegments(path: string): string[] {
  // Stored paths are routes (`/machines/colina-pack-s`), but stripping a query
  // or fragment costs nothing and keeps a hand-seeded row from falling into
  // `other` for the wrong reason.
  const clean = path.split(/[?#]/, 1)[0];
  return clean.split('/').filter(Boolean);
}

export function sectionForPath(path: string): TrafficSection {
  const [first] = pathSegments(path);
  switch (first) {
    case undefined:
      return 'home';
    case 'machines':
      return 'machines';
    case 'categories':
      return 'categories';
    case 'maintenance':
      return 'maintenance';
    case 'contact':
      return 'contact';
    default:
      return 'other';
  }
}

export type PageLabel = {
  /** Message key under `Insights.pageLabels.*`. */
  key:
    | 'home'
    | 'machines'
    | 'machine'
    | 'categories'
    | 'category'
    | 'maintenance'
    | 'maintenanceCategory'
    | 'maintenanceRequest'
    | 'agents'
    | 'contact'
    | 'privacy'
    | 'partners'
    | 'services'
    | 'about'
    | 'other';
  /** Slug/id for the message's `{name}` placeholder. */
  name?: string;
};

/**
 * Maps a stored route to a stable, translatable label. The raw path is still
 * rendered next to it; this is a reading aid, not a replacement for the
 * address the operator may need to match against a browser or the sitemap.
 */
export function pageLabel(path: string): PageLabel {
  const segments = pathSegments(path);

  if (segments.length === 0) {
    return { key: 'home' };
  }

  switch (segments[0]) {
    case 'machines':
      return segments.length === 1
        ? { key: 'machines' }
        : { key: 'machine', name: segments[1] };
    case 'categories':
      return segments.length === 1
        ? { key: 'categories' }
        : { key: 'category', name: segments[1] };
    case 'maintenance':
      if (segments.length === 1) {
        return { key: 'maintenance' };
      }
      return segments.length === 2
        ? { key: 'maintenanceCategory', name: segments[1] }
        : {
            key: 'maintenanceRequest',
            name: `${segments[1]}/${segments[2]}`,
          };
    case 'agents':
      return segments.length === 1 ? { key: 'agents' } : { key: 'other' };
    case 'contact':
      return segments.length === 1 ? { key: 'contact' } : { key: 'other' };
    case 'privacy':
      return segments.length === 1 ? { key: 'privacy' } : { key: 'other' };
    case 'partners':
      return segments.length === 1 ? { key: 'partners' } : { key: 'other' };
    case 'services':
      return segments.length === 1 ? { key: 'services' } : { key: 'other' };
    case 'about':
      return segments.length === 1 ? { key: 'about' } : { key: 'other' };
    default:
      return { key: 'other' };
  }
}

// ---------------------------------------------------------------------------
// SQL aggregation
// ---------------------------------------------------------------------------

export type PathTotal = { path: string; total: number };
export type LocaleTotal = { locale: string; total: number };

const countWindow = (range: DayRange) => ({
  date: { gte: range.from, lt: range.to },
});

/** Summed views for a window, in SQL. */
export async function totalViews(range: DayRange): Promise<number> {
  const result = await prisma.pageViewDaily.aggregate({
    where: countWindow(range),
    _sum: { count: true },
  });
  return result._sum.count ?? 0;
}

/** Daily totals for the days that have rows, ascending, in SQL. */
export async function viewsPerDay(range: DayRange): Promise<DailyViews[]> {
  const grouped = await prisma.pageViewDaily.groupBy({
    by: ['date'],
    where: countWindow(range),
    _sum: { count: true },
    orderBy: { date: 'asc' },
  });
  return grouped.map((row) => ({
    date: row.date,
    count: row._sum.count ?? 0,
  }));
}

/** One total per distinct stored path, in SQL. */
export async function viewsPerPath(range: DayRange): Promise<PathTotal[]> {
  const grouped = await prisma.pageViewDaily.groupBy({
    by: ['path'],
    where: countWindow(range),
    _sum: { count: true },
    orderBy: [{ _sum: { count: 'desc' } }, { path: 'asc' }],
  });
  return grouped.map((row) => ({
    path: row.path,
    total: row._sum.count ?? 0,
  }));
}

/** One total per stored locale, in SQL. */
export async function viewsPerLocale(range: DayRange): Promise<LocaleTotal[]> {
  const grouped = await prisma.pageViewDaily.groupBy({
    by: ['locale'],
    where: countWindow(range),
    _sum: { count: true },
  });
  return grouped.map((row) => ({
    locale: row.locale,
    total: row._sum.count ?? 0,
  }));
}

// ---------------------------------------------------------------------------
// Report assembly (pure)
// ---------------------------------------------------------------------------

export type TrafficTopPage = {
  path: string;
  label: PageLabel;
  total: number;
  /** Share of the window's total views, 0–100, one decimal. */
  share: number;
};

export type TrafficSectionTotal = {
  section: TrafficSection;
  total: number;
  share: number;
};

export type TrafficLocaleTotal = {
  locale: string;
  total: number;
  share: number;
};

export type TrafficReport = {
  days: TrafficRangeDays;
  currentWindow: DayRange;
  previousWindow: DayRange;
  total: number;
  previousTotal: number;
  changePercent: number | null;
  averagePerDay: number;
  busiestDay: DailyViews | null;
  series: DailyViews[];
  previousSeries: DailyViews[];
  topPages: TrafficTopPage[];
  sections: TrafficSectionTotal[];
  locales: TrafficLocaleTotal[];
};

export type TrafficReportInput = {
  days: TrafficRangeDays;
  now: Date;
  currentTotal: number;
  previousTotal: number;
  daily: DailyViews[];
  previousDaily: DailyViews[];
  pathTotals: PathTotal[];
  localeTotals: LocaleTotal[];
};

const TOP_PAGES = 10;

function sharePercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 1000) / 10;
}

export function buildTrafficReport(input: TrafficReportInput): TrafficReport {
  const { current, previous } = trafficWindows(input.days, input.now);
  const series = padDailySeries(input.daily, current);
  const previousSeries = padDailySeries(input.previousDaily, previous);

  let busiestDay: DailyViews | null = null;
  for (const day of series) {
    if (day.count > (busiestDay?.count ?? 0)) {
      busiestDay = day;
    }
  }
  if (input.currentTotal === 0) {
    busiestDay = null;
  }

  const sortedPaths = [...input.pathTotals].sort(
    (a, b) => b.total - a.total || a.path.localeCompare(b.path)
  );
  const topPages = sortedPaths.slice(0, TOP_PAGES).map((row) => ({
    path: row.path,
    label: pageLabel(row.path),
    total: row.total,
    share: sharePercent(row.total, input.currentTotal),
  }));

  const sectionTotals = new Map<TrafficSection, number>(
    TRAFFIC_SECTIONS.map((section) => [section, 0])
  );
  for (const row of input.pathTotals) {
    const section = sectionForPath(row.path);
    sectionTotals.set(section, (sectionTotals.get(section) ?? 0) + row.total);
  }
  const sections = TRAFFIC_SECTIONS.map((section) => {
    const total = sectionTotals.get(section) ?? 0;
    return {
      section,
      total,
      share: sharePercent(total, input.currentTotal),
    };
  }).sort(
    (a, b) =>
      b.total - a.total ||
      TRAFFIC_SECTIONS.indexOf(a.section) - TRAFFIC_SECTIONS.indexOf(b.section)
  );

  const localeMap = new Map(
    input.localeTotals.map((row) => [row.locale, row.total])
  );
  const locales = ['ar', 'en'].map((locale) => {
    const total = localeMap.get(locale) ?? 0;
    return { locale, total, share: sharePercent(total, input.currentTotal) };
  });

  return {
    days: input.days,
    currentWindow: current,
    previousWindow: previous,
    total: input.currentTotal,
    previousTotal: input.previousTotal,
    changePercent: percentChange(input.currentTotal, input.previousTotal),
    averagePerDay:
      input.days > 0
        ? Math.round((input.currentTotal / input.days) * 10) / 10
        : 0,
    busiestDay,
    series,
    previousSeries,
    topPages,
    sections,
    locales,
  };
}

/** Runs the SQL aggregations and assembles the dashboard's traffic report. */
export async function loadTrafficReport(
  days: TrafficRangeDays,
  now: Date = new Date()
): Promise<TrafficReport> {
  const windows = trafficWindows(days, now);
  const [
    currentTotal,
    previousTotal,
    daily,
    previousDaily,
    pathTotals,
    localeTotals,
  ] = await Promise.all([
    totalViews(windows.current),
    totalViews(windows.previous),
    viewsPerDay(windows.current),
    viewsPerDay(windows.previous),
    viewsPerPath(windows.current),
    viewsPerLocale(windows.current),
  ]);

  return buildTrafficReport({
    days,
    now,
    currentTotal,
    previousTotal,
    daily,
    previousDaily,
    pathTotals,
    localeTotals,
  });
}
