// Security data for the insights dashboard.
//
// The table is append-only and grows with every refused public form post or
// rejected admin sign-in, so the dashboard never loads it to count it. Totals,
// per-type counts, daily buckets and top targets are all aggregated in SQL;
// only the current page of recent events selects raw rows.
//
// IP addresses are masked here, before a row leaves this module. The page can
// only ever receive `a.b.c.x` / a truncated IPv6 prefix, never the address an
// event was recorded with.

import { prisma, utcDayKey } from '@colina/db';
import type { DayRange, SecurityEventType } from '@colina/db';
import {
  percentChange,
  trafficWindows,
  type TrafficRangeDays,
} from './insights-traffic';

/** Stored `SecurityEvent.type` codes, in the order the dashboard shows them. */
export const SECURITY_EVENT_TYPES = [
  'RATE_LIMITED',
  'HONEYPOT_CAUGHT',
  'LOGIN_FAILED',
] as const satisfies readonly SecurityEventType[];

/** The recent-events table shows twenty rows at a time, as it did before. */
export const SECURITY_PAGE_SIZE = 20;

const TOP_TARGETS = 5;

export type SecurityTypeCounts = Record<SecurityEventType, number>;

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

/** A page past the end (a stale link, a shrinking result set) is pinned to the
 *  last real page rather than showing an empty table. */
export function clampPage(page: number, totalPages: number): number {
  return Math.min(Math.max(1, page), Math.max(1, totalPages));
}

// ---------------------------------------------------------------------------
// IP masking
// ---------------------------------------------------------------------------

type Ipv4Octets = [number, number, number, number];

function parseIpv4(value: string): Ipv4Octets | null {
  const parts = value.split('.');
  if (parts.length !== 4) {
    return null;
  }

  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) {
      return null;
    }
    const octet = Number(part);
    if (octet > 255) {
      return null;
    }
    octets.push(octet);
  }
  return octets as Ipv4Octets;
}

/**
 * Expands a valid IPv6 address to its eight 16-bit groups. A dotted IPv4 tail
 * (`::ffff:192.0.2.128`) is accepted and becomes its two hexadecimal groups;
 * anything that is not a complete address is rejected rather than guessed at.
 */
function parseIpv6(value: string): number[] | null {
  if (!value.includes(':')) {
    return null;
  }

  let text = value.toLowerCase();
  const lastColon = text.lastIndexOf(':');
  const tail = text.slice(lastColon + 1);
  if (tail.includes('.')) {
    const ipv4 = parseIpv4(tail);
    if (!ipv4) {
      return null;
    }
    const high = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const low = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    text = `${text.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = text.split('::');
  if (halves.length > 2) {
    return null;
  }

  const groupsFor = (part: string) => (part === '' ? [] : part.split(':'));
  let groups: string[];
  if (halves.length === 1) {
    groups = groupsFor(text);
    if (groups.length !== 8) {
      return null;
    }
  } else {
    const left = groupsFor(halves[0]);
    const right = groupsFor(halves[1]);
    // `::` must stand for at least one all-zero group.
    if (left.length + right.length >= 8) {
      return null;
    }
    groups = [
      ...left,
      ...Array.from({ length: 8 - left.length - right.length }, () => '0'),
      ...right,
    ];
  }

  const parsed: number[] = [];
  for (const group of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(group)) {
      return null;
    }
    parsed.push(Number.parseInt(group, 16));
  }
  return parsed;
}

/**
 * Masks a stored address so the dashboard can never show the full value.
 *
 * IPv4 becomes `a.b.c.x`; IPv6 becomes its first three expanded groups plus an
 * ellipsis. Empty, malformed and non-address values become `null` — a spoofed
 * header value must not reach the page just because it was stored.
 */
export function maskIp(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) {
    return null;
  }

  const ipv4 = parseIpv4(trimmed);
  if (ipv4) {
    return `${ipv4[0]}.${ipv4[1]}.${ipv4[2]}.x`;
  }

  const ipv6 = parseIpv6(trimmed);
  if (ipv6) {
    return `${ipv6
      .slice(0, 3)
      .map((group) => group.toString(16))
      .join(':')}…`;
  }

  return null;
}

// ---------------------------------------------------------------------------
// SQL aggregation
// ---------------------------------------------------------------------------

function counterWindow(range: DayRange) {
  return { createdAt: { gte: range.from, lt: range.to } };
}

function rangeWhere(range: DayRange, type?: SecurityEventType) {
  return {
    ...counterWindow(range),
    ...(type ? { type } : {}),
  };
}

function emptyTypeCounts(): SecurityTypeCounts {
  return Object.fromEntries(
    SECURITY_EVENT_TYPES.map((type) => [type, 0])
  ) as SecurityTypeCounts;
}

/** Counted in SQL; no event rows cross the wire. */
export async function totalSecurityEvents(range: DayRange): Promise<number> {
  return prisma.securityEvent.count({ where: counterWindow(range) });
}

/** One count per stored type, including types with no rows in the window. */
export async function securityEventCountsByType(
  range: DayRange
): Promise<SecurityTypeCounts> {
  const grouped = await prisma.securityEvent.groupBy({
    by: ['type'],
    where: counterWindow(range),
    _count: { _all: true },
  });

  const counts = emptyTypeCounts();
  for (const row of grouped) {
    counts[row.type] = row._count._all;
  }
  return counts;
}

export type SecurityDailyCount = {
  date: Date;
  type: SecurityEventType;
  count: number;
};

/** Daily counts per type, bucketed by PostgreSQL rather than in Node. */
export async function securityEventsPerDay(
  range: DayRange
): Promise<SecurityDailyCount[]> {
  const grouped = await prisma.$queryRaw<
    Array<{ day: Date; type: SecurityEventType; count: number }>
  >`
    SELECT date_trunc('day', "createdAt") AS "day",
           "type"::text AS "type",
           count(*)::int AS "count"
    FROM "SecurityEvent"
    WHERE "createdAt" >= ${range.from}
      AND "createdAt" < ${range.to}
    GROUP BY "day", "type"
    ORDER BY "day" ASC
  `;

  return grouped.map((row) => ({
    date: row.day,
    type: row.type,
    count: row.count,
  }));
}

export type SecurityTargetCount = { target: string; total: number };

/** The five most frequent stored `source` values in the window. */
export async function topSecurityTargets(
  range: DayRange
): Promise<SecurityTargetCount[]> {
  const grouped = await prisma.securityEvent.groupBy({
    by: ['source'],
    where: counterWindow(range),
    _count: { source: true },
    orderBy: [{ _count: { source: 'desc' } }, { source: 'asc' }],
    take: TOP_TARGETS,
  });

  return grouped.map((row) => ({
    target: row.source,
    total: row._count.source,
  }));
}

export type SecurityEventRow = {
  id: string;
  type: SecurityEventType;
  /** The endpoint or form that was targeted (`source` in the schema). */
  target: string;
  /** Already masked: `a.b.c.x` / first three IPv6 groups, or null. */
  maskedIp: string | null;
  createdAt: Date;
};

export type SecurityEventPage = {
  rows: SecurityEventRow[];
  /** Matching rows in the window, before `take`/`skip`. */
  total: number;
};

/** One page of recent events, newest first, with every IP masked. */
export async function recentSecurityEvents({
  range,
  type,
  page,
  pageSize = SECURITY_PAGE_SIZE,
}: {
  range: DayRange;
  type?: SecurityEventType;
  /** 1-based; sanitized here so a caller cannot produce a negative offset. */
  page: number;
  pageSize?: number;
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
        createdAt: true,
      },
    }),
    prisma.securityEvent.count({ where }),
  ]);

  return {
    rows: rows.map((row) => ({
      id: row.id,
      type: row.type,
      target: row.source,
      maskedIp: maskIp(row.ip),
      createdAt: row.createdAt,
    })),
    total,
  };
}

// ---------------------------------------------------------------------------
// Report assembly (pure)
// ---------------------------------------------------------------------------

export type SecurityTypeSummary = {
  type: SecurityEventType;
  total: number;
  previousTotal: number;
  changePercent: number | null;
};

export type SecurityDailyPoint = {
  date: Date;
  /** Count per type that day, with every type present even when zero. */
  counts: SecurityTypeCounts;
  total: number;
};

export type SecurityTarget = {
  target: string;
  total: number;
  /** Share of the window's total events, 0–100, one decimal. */
  share: number;
};

export type SecurityEventsPage = SecurityEventPage & {
  page: number;
  totalPages: number;
};

export type SecurityReport = {
  days: TrafficRangeDays;
  currentWindow: DayRange;
  previousWindow: DayRange;
  total: number;
  previousTotal: number;
  changePercent: number | null;
  types: SecurityTypeSummary[];
  series: SecurityDailyPoint[];
  topTargets: SecurityTarget[];
  events: SecurityEventsPage;
  typeFilter: SecurityEventType | undefined;
};

export type SecurityReportInput = {
  days: TrafficRangeDays;
  now: Date;
  currentTotal: number;
  previousTotal: number;
  currentByType: SecurityTypeCounts;
  previousByType: SecurityTypeCounts;
  daily: SecurityDailyCount[];
  targetTotals: SecurityTargetCount[];
  events: SecurityEventPage & { page: number };
  typeFilter?: SecurityEventType;
};

/**
 * The series with every day in the window present, ascending, and every type
 * represented on every day. A quiet day must be a zero column, not a missing
 * one that the chart silently compresses.
 */
export function padSecuritySeries(
  series: SecurityDailyCount[],
  window: DayRange
): SecurityDailyPoint[] {
  const byTime = new Map<number, SecurityDailyPoint>();
  for (const point of series) {
    const time = utcDayKey(point.date).getTime();
    let day = byTime.get(time);
    if (!day) {
      day = {
        date: utcDayKey(point.date),
        counts: emptyTypeCounts(),
        total: 0,
      };
      byTime.set(time, day);
    }
    day.counts[point.type] += point.count;
    day.total += point.count;
  }

  const days: SecurityDailyPoint[] = [];
  for (
    let time = window.from.getTime();
    time < window.to.getTime();
    time += 24 * 60 * 60 * 1000
  ) {
    const date = new Date(time);
    days.push(
      byTime.get(date.getTime()) ?? {
        date,
        counts: emptyTypeCounts(),
        total: 0,
      }
    );
  }
  return days;
}

function sharePercent(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }
  return Math.round((value / total) * 1000) / 10;
}

export function buildSecurityReport(
  input: SecurityReportInput
): SecurityReport {
  const { current, previous } = trafficWindows(input.days, input.now);

  const types = SECURITY_EVENT_TYPES.map((type) => {
    const total = input.currentByType[type] ?? 0;
    const previousTotal = input.previousByType[type] ?? 0;
    return {
      type,
      total,
      previousTotal,
      changePercent: percentChange(total, previousTotal),
    };
  });

  const sortedTargets = [...input.targetTotals].sort(
    (a, b) => b.total - a.total || a.target.localeCompare(b.target)
  );
  const topTargets = sortedTargets.slice(0, TOP_TARGETS).map((row) => ({
    target: row.target,
    total: row.total,
    share: sharePercent(row.total, input.currentTotal),
  }));

  const totalPages = Math.max(
    1,
    Math.ceil(input.events.total / SECURITY_PAGE_SIZE)
  );

  return {
    days: input.days,
    currentWindow: current,
    previousWindow: previous,
    total: input.currentTotal,
    previousTotal: input.previousTotal,
    changePercent: percentChange(input.currentTotal, input.previousTotal),
    types,
    series: padSecuritySeries(input.daily, current),
    topTargets,
    events: {
      rows: input.events.rows,
      total: input.events.total,
      page: clampPage(input.events.page, totalPages),
      totalPages,
    },
    typeFilter: input.typeFilter,
  };
}

export type SecurityReportOptions = {
  type?: SecurityEventType;
  page?: number;
};

/** Runs the SQL aggregations and assembles the dashboard's security report. */
export async function loadSecurityReport(
  days: TrafficRangeDays,
  options: SecurityReportOptions = {},
  now: Date = new Date()
): Promise<SecurityReport> {
  const windows = trafficWindows(days, now);
  const requestedPage =
    options.page !== undefined && options.page > 0
      ? Math.floor(options.page)
      : 1;

  const [
    currentTotal,
    previousTotal,
    currentByType,
    previousByType,
    daily,
    targetTotals,
    firstPage,
  ] = await Promise.all([
    totalSecurityEvents(windows.current),
    totalSecurityEvents(windows.previous),
    securityEventCountsByType(windows.current),
    securityEventCountsByType(windows.previous),
    securityEventsPerDay(windows.current),
    topSecurityTargets(windows.current),
    recentSecurityEvents({
      range: windows.current,
      type: options.type,
      page: requestedPage,
    }),
  ]);

  const totalPages = Math.max(
    1,
    Math.ceil(firstPage.total / SECURITY_PAGE_SIZE)
  );
  const safePage = clampPage(requestedPage, totalPages);
  const events =
    safePage === requestedPage
      ? firstPage
      : await recentSecurityEvents({
          range: windows.current,
          type: options.type,
          page: safePage,
        });

  return buildSecurityReport({
    days,
    now,
    currentTotal,
    previousTotal,
    currentByType,
    previousByType,
    daily,
    targetTotals,
    events: { ...events, page: safePage },
    typeFilter: options.type,
  });
}
