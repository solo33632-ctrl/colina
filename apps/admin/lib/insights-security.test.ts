import { describe, expect, it } from 'vitest';
import type { SecurityEventType } from '@colina/db';
import { trafficWindows } from './insights-traffic';
import {
  buildSecurityReport,
  clampPage,
  isSecurityEventType,
  maskIp,
  padSecuritySeries,
  parseEventType,
  parsePage,
  SECURITY_EVENT_TYPES,
  SECURITY_PAGE_SIZE,
  type SecurityDailyCount,
  type SecurityReportInput,
  type SecurityTypeCounts,
} from './insights-security';

const NOW = new Date(2026, 2, 18, 15, 30, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const dayKeyOf = (y: number, m: number, d: number) =>
  dayKey(new Date(Date.UTC(y, m, d)));

function counts(
  overrides: Partial<Record<SecurityEventType, number>> = {}
): SecurityTypeCounts {
  return Object.fromEntries(
    SECURITY_EVENT_TYPES.map((type) => [type, overrides[type] ?? 0])
  ) as SecurityTypeCounts;
}

describe('parseEventType', () => {
  it('accepts the three stored codes', () => {
    for (const type of SECURITY_EVENT_TYPES) {
      expect(parseEventType(type)).toBe(type);
    }
  });

  it('treats an absent or unknown code as "every type"', () => {
    expect(parseEventType(undefined)).toBeUndefined();
    expect(parseEventType('')).toBeUndefined();
    expect(parseEventType('rate_limited')).toBeUndefined();
    expect(parseEventType('LOGIN_FAILED ')).toBeUndefined();
  });

  it('rejects codes the schema does not have', () => {
    expect(isSecurityEventType('RATE_LIMITED')).toBe(true);
    expect(isSecurityEventType('SOMETHING_NEW')).toBe(false);
  });
});

describe('parsePage / clampPage', () => {
  it('parses a positive page and rejects the rest', () => {
    expect(parsePage('3')).toBe(3);
    for (const value of [undefined, '', '0', '-2', 'two', 'abc']) {
      expect(parsePage(value), String(value)).toBe(1);
    }
  });

  it('pins a page past the end to the last one', () => {
    expect(clampPage(9, 3)).toBe(3);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(1, 1)).toBe(1);
  });

  it('never returns less than page 1, even with no pages at all', () => {
    expect(clampPage(1, 0)).toBe(1);
    expect(clampPage(0, 0)).toBe(1);
    expect(clampPage(-5, 10)).toBe(1);
  });
});

describe('maskIp', () => {
  it('masks the last IPv4 octet', () => {
    expect(maskIp('203.0.113.42')).toBe('203.0.113.x');
    expect(maskIp('127.0.0.1')).toBe('127.0.0.x');
    expect(maskIp('001.002.003.004')).toBe('1.2.3.x');
  });

  it('keeps the first three expanded IPv6 groups', () => {
    expect(maskIp('2001:0db8:85a3:0000:0000:8a2e:0370:7334')).toBe(
      '2001:db8:85a3…'
    );
    expect(maskIp('2001:db8::1')).toBe('2001:db8:0…');
    expect(maskIp('::1')).toBe('0:0:0…');
    expect(maskIp('::ffff:192.0.2.128')).toBe('0:0:0…');
  });

  it('returns null for empty, malformed and non-address values', () => {
    for (const value of [
      undefined,
      null,
      '',
      '   ',
      'unknown',
      '1.2.3',
      '999.1.2.3',
      '1.2.3.4.5',
      '2001:db8:::1',
      '2001:db8:85a3:0000:0000:8a2e:0370:7334:1',
      '1.2.3.4:8080',
    ]) {
      expect(maskIp(value), String(value)).toBeNull();
    }
  });
});

describe('padSecuritySeries', () => {
  it('returns every day and every type, filling gaps with zero', () => {
    const { current } = trafficWindows(7, NOW);
    const series: SecurityDailyCount[] = [
      {
        date: new Date(current.from.getTime() + 2 * DAY_MS),
        type: 'RATE_LIMITED',
        count: 4,
      },
      {
        date: new Date(current.from.getTime() + 2 * DAY_MS),
        type: 'LOGIN_FAILED',
        count: 2,
      },
      {
        date: new Date(current.from.getTime() + 5 * DAY_MS),
        type: 'HONEYPOT_CAUGHT',
        count: 9,
      },
    ];

    const filled = padSecuritySeries(series, current);
    expect(filled).toHaveLength(7);
    expect(filled[0].date.getTime()).toBe(current.from.getTime());
    expect(filled[6].date.getTime()).toBe(current.to.getTime() - DAY_MS);
    expect(filled.map((day) => day.total)).toEqual([0, 0, 6, 0, 0, 9, 0]);
    expect(filled[2].counts).toEqual(
      counts({ RATE_LIMITED: 4, LOGIN_FAILED: 2 })
    );
    expect(filled[5].counts).toEqual(counts({ HONEYPOT_CAUGHT: 9 }));
    expect(filled[0].counts).toEqual(counts());
  });

  it('returns an all-zero series for an empty window', () => {
    const { current } = trafficWindows(30, NOW);
    const filled = padSecuritySeries([], current);
    expect(filled).toHaveLength(30);
    expect(filled.every((day) => day.total === 0)).toBe(true);
    expect(
      filled.every((day) =>
        SECURITY_EVENT_TYPES.every((type) => day.counts[type] === 0)
      )
    ).toBe(true);
  });

  it('ignores points outside the window', () => {
    const { current } = trafficWindows(7, NOW);
    const filled = padSecuritySeries(
      [
        {
          date: new Date(current.from.getTime() - DAY_MS),
          type: 'RATE_LIMITED',
          count: 99,
        },
        { date: current.from, type: 'RATE_LIMITED', count: 3 },
        { date: current.to, type: 'RATE_LIMITED', count: 77 },
      ],
      current
    );
    expect(filled[0].counts.RATE_LIMITED).toBe(3);
    expect(filled.reduce((sum, day) => sum + day.total, 0)).toBe(3);
  });
});

function reportInput(
  overrides: Partial<SecurityReportInput> = {}
): SecurityReportInput {
  return {
    days: 7,
    now: NOW,
    currentTotal: 100,
    previousTotal: 50,
    currentByType: counts({
      RATE_LIMITED: 30,
      HONEYPOT_CAUGHT: 20,
      LOGIN_FAILED: 50,
    }),
    previousByType: counts({
      RATE_LIMITED: 10,
      HONEYPOT_CAUGHT: 10,
      LOGIN_FAILED: 30,
    }),
    daily: [],
    targetTotals: [],
    events: { rows: [], total: 0, page: 1 },
    ...overrides,
  };
}

describe('buildSecurityReport', () => {
  it('uses the same adjacent windows as the traffic section', () => {
    const report = buildSecurityReport(reportInput());
    const expected = trafficWindows(7, NOW);
    expect(report.currentWindow).toEqual(expected.current);
    expect(report.previousWindow).toEqual(expected.previous);
    expect(dayKey(report.currentWindow.from)).toBe(dayKeyOf(2026, 2, 12));
    expect(dayKey(report.currentWindow.to)).toBe(dayKeyOf(2026, 2, 19));
    expect(dayKey(report.previousWindow.from)).toBe(dayKeyOf(2026, 2, 5));
    expect(dayKey(report.previousWindow.to)).toBe(dayKeyOf(2026, 2, 12));
  });

  it('assembles totals, per-type deltas and a zero-padded series', () => {
    const { current } = trafficWindows(7, NOW);
    const report = buildSecurityReport(
      reportInput({
        daily: [
          {
            date: new Date(current.from.getTime() + DAY_MS),
            type: 'LOGIN_FAILED',
            count: 10,
          },
          {
            date: new Date(current.from.getTime() + DAY_MS),
            type: 'RATE_LIMITED',
            count: 5,
          },
        ],
      })
    );

    expect(report.total).toBe(100);
    expect(report.previousTotal).toBe(50);
    expect(report.changePercent).toBe(100);
    expect(report.series).toHaveLength(7);
    expect(report.series[1].total).toBe(15);
    expect(report.series[1].counts).toEqual(
      counts({ LOGIN_FAILED: 10, RATE_LIMITED: 5 })
    );
    expect(report.types).toEqual([
      {
        type: 'RATE_LIMITED',
        total: 30,
        previousTotal: 10,
        changePercent: 200,
      },
      {
        type: 'HONEYPOT_CAUGHT',
        total: 20,
        previousTotal: 10,
        changePercent: 100,
      },
      {
        type: 'LOGIN_FAILED',
        total: 50,
        previousTotal: 30,
        changePercent: 67,
      },
    ]);
  });

  it('reports no previous data instead of a fake percentage', () => {
    const report = buildSecurityReport(
      reportInput({
        currentTotal: 12,
        previousTotal: 0,
        currentByType: counts({ LOGIN_FAILED: 12 }),
        previousByType: counts(),
        events: { rows: [], total: 12, page: 1 },
      })
    );

    expect(report.changePercent).toBeNull();
    expect(
      report.types.find((row) => row.type === 'LOGIN_FAILED')
    ).toMatchObject({ total: 12, previousTotal: 0, changePercent: null });
    expect(
      report.types
        .filter((row) => row.type !== 'LOGIN_FAILED')
        .every((row) => row.changePercent === null)
    ).toBe(true);
  });

  it('ranks top targets, computes shares and keeps five', () => {
    const report = buildSecurityReport(
      reportInput({
        targetTotals: [
          { target: 'contact', total: 30 },
          { target: 'admin-login', total: 50 },
          { target: 'maintenance-request', total: 10 },
          { target: 'a', total: 5 },
          { target: 'b', total: 5 },
          { target: 'c', total: 5 },
        ],
      })
    );

    expect(report.topTargets).toHaveLength(5);
    expect(report.topTargets.map((row) => row.target)).toEqual([
      'admin-login',
      'contact',
      'maintenance-request',
      'a',
      'b',
    ]);
    expect(report.topTargets[0]).toEqual({
      target: 'admin-login',
      total: 50,
      share: 50,
    });
    expect(report.topTargets[2].share).toBe(10);
  });

  it('paginates recent events in twenty-row pages', () => {
    const report = buildSecurityReport(
      reportInput({
        events: {
          rows: [],
          total: SECURITY_PAGE_SIZE * 2 + 1,
          page: 9,
        },
      })
    );

    expect(report.events.totalPages).toBe(3);
    expect(report.events.page).toBe(3);
    expect(report.events.total).toBe(41);
  });

  it('keeps the active type filter on the report without filtering the KPIs', () => {
    const report = buildSecurityReport(
      reportInput({
        typeFilter: 'LOGIN_FAILED',
        events: {
          rows: [],
          total: 2,
          page: 1,
        },
      })
    );

    expect(report.typeFilter).toBe('LOGIN_FAILED');
    expect(report.total).toBe(100);
    expect(report.types[2].total).toBe(50);
    expect(report.events.total).toBe(2);
  });

  it('handles an empty window without inventing data', () => {
    const report = buildSecurityReport(
      reportInput({
        currentTotal: 0,
        previousTotal: 0,
        currentByType: counts(),
        previousByType: counts(),
        events: { rows: [], total: 0, page: 1 },
      })
    );

    expect(report.changePercent).toBeNull();
    expect(report.types.every((row) => row.total === 0)).toBe(true);
    expect(report.types.every((row) => row.changePercent === null)).toBe(true);
    expect(report.series).toHaveLength(7);
    expect(report.series.every((day) => day.total === 0)).toBe(true);
    expect(report.topTargets).toEqual([]);
    expect(report.events).toEqual({
      rows: [],
      total: 0,
      page: 1,
      totalPages: 1,
    });
  });
});
