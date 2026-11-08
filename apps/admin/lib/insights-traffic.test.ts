import { describe, expect, it } from 'vitest';
import type { DailyViews } from '@colina/db';
import {
  buildTrafficReport,
  DEFAULT_TRAFFIC_RANGE_DAYS,
  MAX_CHANGE_PERCENT,
  pageLabel,
  padDailySeries,
  parseTrafficRange,
  percentChange,
  sectionForPath,
  SMALL_PREVIOUS_VIEWS,
  trafficChange,
  trafficWindows,
  TRAFFIC_RANGE_DAYS,
  TRAFFIC_SECTIONS,
  type TrafficReportInput,
} from './insights-traffic';

// Fixed local time with a non-midnight clock, so a UTC-vs-local day-boundary
// slip shows up instead of hiding behind midnight.
const NOW = new Date(2026, 2, 18, 15, 30, 0);
const DAY_MS = 24 * 60 * 60 * 1000;
const dayKey = (date: Date) => date.toISOString().slice(0, 10);
const dayKeyOf = (y: number, m: number, d: number) =>
  dayKey(new Date(Date.UTC(y, m, d)));

describe('parseTrafficRange', () => {
  it('accepts exactly the three offered ranges', () => {
    for (const days of TRAFFIC_RANGE_DAYS) {
      expect(parseTrafficRange(String(days))).toBe(days);
    }
  });

  it('defaults invalid and absent ranges to 30 days', () => {
    expect(DEFAULT_TRAFFIC_RANGE_DAYS).toBe(30);
    for (const value of [undefined, '', '14', '0', '-7', 'seven', 'abc']) {
      expect(parseTrafficRange(value), String(value)).toBe(30);
    }
  });

  it('reads a leading number, then still checks the allow-list', () => {
    expect(parseTrafficRange('7days')).toBe(7);
    expect(parseTrafficRange('30.9')).toBe(30);
    expect(parseTrafficRange('90.9')).toBe(90);
    expect(parseTrafficRange('900')).toBe(30);
  });
});

describe('trafficWindows', () => {
  it('covers the last 7 days and the 7 days immediately before them', () => {
    const { current, previous } = trafficWindows(7, NOW);
    expect(dayKey(current.from)).toBe(dayKeyOf(2026, 2, 12));
    expect(dayKey(current.to)).toBe(dayKeyOf(2026, 2, 19));
    expect(dayKey(previous.from)).toBe(dayKeyOf(2026, 2, 5));
    expect(dayKey(previous.to)).toBe(dayKeyOf(2026, 2, 12));
  });

  it.each([7, 30, 90] as const)(
    'keeps %i-day windows adjacent and equally long',
    (days) => {
      const { current, previous } = trafficWindows(days, NOW);
      expect(previous.to.getTime()).toBe(current.from.getTime());
      expect((current.to.getTime() - current.from.getTime()) / DAY_MS).toBe(
        days
      );
      expect((previous.to.getTime() - previous.from.getTime()) / DAY_MS).toBe(
        days
      );
    }
  );

  it('uses the server calendar day even late at night', () => {
    const late = new Date(2026, 2, 18, 23, 30);
    const { current } = trafficWindows(7, late);
    expect(dayKey(current.to)).toBe(dayKeyOf(2026, 2, 19));
  });
});

describe('percentChange', () => {
  it('rounds an increase or decrease to a whole percent', () => {
    expect(percentChange(150, 100)).toBe(50);
    expect(percentChange(50, 100)).toBe(-50);
    expect(percentChange(100, 100)).toBe(0);
    expect(percentChange(133, 100)).toBe(33);
    expect(percentChange(1, 3)).toBe(-67);
  });

  it('is null when there is no previous window to compare against', () => {
    expect(percentChange(0, 0)).toBeNull();
    expect(percentChange(42, 0)).toBeNull();
  });
});

describe('trafficChange', () => {
  it('keeps the empty-previous-period message', () => {
    expect(trafficChange(12, 0)).toEqual({ kind: 'empty' });
    expect(trafficChange(0, 0)).toEqual({ kind: 'empty' });
  });

  it('reports no change when both windows match', () => {
    expect(trafficChange(40, 40)).toEqual({ kind: 'same' });
    expect(trafficChange(0, 0)).toEqual({ kind: 'empty' });
  });

  it('uses an absolute count below the small-window threshold', () => {
    expect(SMALL_PREVIOUS_VIEWS).toBe(50);
    expect(trafficChange(50, 40)).toEqual({
      kind: 'absolute',
      direction: 'up',
      count: 10,
    });
    expect(trafficChange(30, 40)).toEqual({
      kind: 'absolute',
      direction: 'down',
      count: 10,
    });
    expect(trafficChange(0, 30)).toEqual({
      kind: 'absolute',
      direction: 'down',
      count: 30,
    });
  });

  it('uses a percentage once the previous window reaches the threshold', () => {
    expect(trafficChange(75, 50)).toEqual({
      kind: 'percent',
      direction: 'up',
      percent: 50,
      capped: false,
    });
    expect(trafficChange(50, 100)).toEqual({
      kind: 'percent',
      direction: 'down',
      percent: 50,
      capped: false,
    });
  });

  it('caps a huge increase at 999%', () => {
    expect(MAX_CHANGE_PERCENT).toBe(999);
    expect(trafficChange(1099, 100)).toEqual({
      kind: 'percent',
      direction: 'up',
      percent: 999,
      capped: false,
    });
    expect(trafficChange(1100, 100)).toEqual({
      kind: 'percent',
      direction: 'up',
      percent: 999,
      capped: true,
    });
    expect(trafficChange(100_000, 100)).toEqual({
      kind: 'percent',
      direction: 'up',
      percent: 999,
      capped: true,
    });
  });

  it('handles a negative change with a large previous window', () => {
    expect(trafficChange(25, 100)).toEqual({
      kind: 'percent',
      direction: 'down',
      percent: 75,
      capped: false,
    });
    expect(trafficChange(0, 100)).toEqual({
      kind: 'percent',
      direction: 'down',
      percent: 100,
      capped: false,
    });
  });
});

describe('padDailySeries', () => {
  it('returns every day in ascending order, filling gaps with zero', () => {
    const { current } = trafficWindows(7, NOW);
    const filled = padDailySeries(
      [
        { date: new Date(current.from.getTime() + 2 * DAY_MS), count: 4 },
        { date: new Date(current.from.getTime() + 5 * DAY_MS), count: 9 },
      ],
      current
    );

    expect(filled).toHaveLength(7);
    expect(filled.map((day) => day.count)).toEqual([0, 0, 4, 0, 0, 9, 0]);
    expect(filled[0].date.getTime()).toBe(current.from.getTime());
    expect(filled[6].date.getTime()).toBe(current.to.getTime() - DAY_MS);
    for (let index = 1; index < filled.length; index += 1) {
      expect(filled[index].date.getTime()).toBeGreaterThan(
        filled[index - 1].date.getTime()
      );
    }
  });

  it('returns an all-zero series for an empty window', () => {
    const { current } = trafficWindows(30, NOW);
    const filled = padDailySeries([], current);
    expect(filled).toHaveLength(30);
    expect(filled.every((day) => day.count === 0)).toBe(true);
  });

  it('ignores points outside the window', () => {
    const { current } = trafficWindows(7, NOW);
    const filled = padDailySeries(
      [
        { date: new Date(current.from.getTime() - DAY_MS), count: 99 },
        { date: current.from, count: 3 },
        { date: current.to, count: 77 },
      ],
      current
    );
    expect(filled[0].count).toBe(3);
    expect(filled.reduce((sum, day) => sum + day.count, 0)).toBe(3);
  });
});

describe('sectionForPath', () => {
  it('groups known prefixes and keeps lookalikes in other', () => {
    expect(sectionForPath('/')).toBe('home');
    expect(sectionForPath('')).toBe('home');
    expect(sectionForPath('/machines')).toBe('machines');
    expect(sectionForPath('/machines/colina-pack-s')).toBe('machines');
    expect(sectionForPath('/categories/production-lines')).toBe('categories');
    expect(sectionForPath('/maintenance/line-a/request-1')).toBe('maintenance');
    expect(sectionForPath('/contact')).toBe('contact');
    expect(sectionForPath('/contact-us')).toBe('other');
    expect(sectionForPath('/machines-archive')).toBe('other');
    expect(sectionForPath('/agents')).toBe('other');
    expect(sectionForPath('/privacy?from=email')).toBe('other');
  });
});

describe('pageLabel', () => {
  it('labels the static routes', () => {
    expect(pageLabel('/')).toEqual({ key: 'home' });
    expect(pageLabel('/machines')).toEqual({ key: 'machines' });
    expect(pageLabel('/categories')).toEqual({ key: 'categories' });
    expect(pageLabel('/maintenance')).toEqual({ key: 'maintenance' });
    expect(pageLabel('/agents')).toEqual({ key: 'agents' });
    expect(pageLabel('/contact')).toEqual({ key: 'contact' });
    expect(pageLabel('/privacy')).toEqual({ key: 'privacy' });
    expect(pageLabel('/partners')).toEqual({ key: 'partners' });
    expect(pageLabel('/services')).toEqual({ key: 'services' });
    expect(pageLabel('/about')).toEqual({ key: 'about' });
  });

  it('carries the slug of a known detail route', () => {
    expect(pageLabel('/machines/colina-pack-s')).toEqual({
      key: 'machine',
      name: 'colina-pack-s',
    });
    expect(pageLabel('/categories/production-lines')).toEqual({
      key: 'category',
      name: 'production-lines',
    });
    expect(pageLabel('/maintenance/line-a')).toEqual({
      key: 'maintenanceCategory',
      name: 'line-a',
    });
    expect(pageLabel('/maintenance/line-a/request-1')).toEqual({
      key: 'maintenanceRequest',
      name: 'line-a/request-1',
    });
  });

  it('falls back to other for unknown or deeper routes', () => {
    expect(pageLabel('/machines/colina-pack-s/gallery')).toEqual({
      key: 'machine',
      name: 'colina-pack-s',
    });
    expect(pageLabel('/contact/thanks')).toEqual({ key: 'other' });
    expect(pageLabel('/another-page')).toEqual({ key: 'other' });
  });
});

function reportInput(
  overrides: Partial<TrafficReportInput> = {}
): TrafficReportInput {
  return {
    days: 7,
    now: NOW,
    currentTotal: 100,
    previousTotal: 50,
    daily: [],
    previousDaily: [],
    pathTotals: [],
    localeTotals: [],
    ...overrides,
  };
}

describe('buildTrafficReport', () => {
  it('assembles totals, delta, average and busiest day', () => {
    const { current } = trafficWindows(7, NOW);
    const daily: DailyViews[] = [
      { date: new Date(current.from.getTime() + DAY_MS), count: 40 },
      { date: new Date(current.from.getTime() + 3 * DAY_MS), count: 60 },
    ];
    const report = buildTrafficReport(
      reportInput({
        daily,
        previousDaily: [
          { date: new Date(current.from.getTime() - 3 * DAY_MS), count: 50 },
        ],
      })
    );

    expect(report.total).toBe(100);
    expect(report.previousTotal).toBe(50);
    expect(report.changePercent).toBe(100);
    expect(report.averagePerDay).toBe(14.3);
    expect(report.series).toHaveLength(7);
    expect(report.series.reduce((sum, day) => sum + day.count, 0)).toBe(100);
    expect(report.previousSeries).toHaveLength(7);
    expect(report.previousSeries.reduce((sum, day) => sum + day.count, 0)).toBe(
      50
    );
    expect(report.busiestDay?.count).toBe(60);
    expect(report.busiestDay?.date.getTime()).toBe(
      current.from.getTime() + 3 * DAY_MS
    );
  });

  it('ranks top pages, computes shares and maps friendly labels', () => {
    const report = buildTrafficReport(
      reportInput({
        pathTotals: [
          { path: '/machines/alpha', total: 20 },
          { path: '/', total: 30 },
          { path: '/categories/line', total: 10 },
          { path: '/maintenance', total: 15 },
          { path: '/contact', total: 5 },
          { path: '/agents', total: 20 },
        ],
      })
    );

    expect(report.topPages.map((page) => page.path)).toEqual([
      '/',
      '/agents',
      '/machines/alpha',
      '/maintenance',
      '/categories/line',
      '/contact',
    ]);
    expect(report.topPages[0]).toMatchObject({
      total: 30,
      share: 30,
      label: { key: 'home' },
    });
    expect(report.topPages[2].label).toEqual({
      key: 'machine',
      name: 'alpha',
    });
    expect(report.topPages[2].share).toBe(20);
  });

  it('caps top pages at ten while sections still sum every path', () => {
    const pathTotals = Array.from({ length: 20 }, (_, index) => ({
      path: `/machines/m-${index}`,
      total: index + 1,
    }));
    const report = buildTrafficReport(
      reportInput({
        currentTotal: pathTotals.reduce((sum, row) => sum + row.total, 0),
        pathTotals,
      })
    );

    expect(report.topPages).toHaveLength(10);
    const machines = report.sections.find(
      (section) => section.section === 'machines'
    );
    expect(machines?.total).toBe(210);
    expect(machines?.share).toBe(100);
  });

  it('groups sections by prefix and keeps a stable zero-inclusive order', () => {
    const report = buildTrafficReport(
      reportInput({
        pathTotals: [
          { path: '/', total: 30 },
          { path: '/machines/alpha', total: 20 },
          { path: '/categories/line', total: 10 },
          { path: '/maintenance', total: 15 },
          { path: '/contact', total: 5 },
          { path: '/agents', total: 20 },
        ],
      })
    );

    expect(report.sections.map((section) => section.section)).toEqual([
      'home',
      'machines',
      'other',
      'maintenance',
      'categories',
      'contact',
    ]);
    expect(
      report.sections.reduce((sum, section) => sum + section.total, 0)
    ).toBe(100);
    expect(
      report.sections.find((section) => section.section === 'other')
    ).toEqual({ section: 'other', total: 20, share: 20 });
  });

  it('splits Arabic and English shares out of the window total', () => {
    const report = buildTrafficReport(
      reportInput({
        localeTotals: [
          { locale: 'en', total: 40 },
          { locale: 'ar', total: 60 },
        ],
      })
    );

    expect(report.locales).toEqual([
      { locale: 'ar', total: 60, share: 60 },
      { locale: 'en', total: 40, share: 40 },
    ]);
  });

  it('handles an empty window without inventing a comparison or a busiest day', () => {
    const report = buildTrafficReport(
      reportInput({ currentTotal: 0, previousTotal: 0 })
    );

    expect(report.changePercent).toBeNull();
    expect(report.averagePerDay).toBe(0);
    expect(report.busiestDay).toBeNull();
    expect(report.series).toHaveLength(7);
    expect(report.series.every((day) => day.count === 0)).toBe(true);
    expect(report.previousSeries).toHaveLength(7);
    expect(report.topPages).toEqual([]);
    expect(report.sections.map((section) => section.section)).toEqual([
      ...TRAFFIC_SECTIONS,
    ]);
    expect(report.sections.every((section) => section.total === 0)).toBe(true);
    expect(report.locales).toEqual([
      { locale: 'ar', total: 0, share: 0 },
      { locale: 'en', total: 0, share: 0 },
    ]);
  });

  it('reports no previous data when the prior window is empty', () => {
    const report = buildTrafficReport(
      reportInput({ currentTotal: 12, previousTotal: 0 })
    );
    expect(report.changePercent).toBeNull();
  });
});
