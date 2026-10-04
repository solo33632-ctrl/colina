import { describe, expect, it } from 'vitest';
import {
  clampPage,
  dailySeriesForWindow,
  DEFAULT_RANGE_DAYS,
  isSecurityEventType,
  parseEventType,
  parsePage,
  parseRangeDays,
  rangeWindow,
  SECURITY_EVENT_TYPES,
  trendBars,
  trendLabelStep,
  TREND,
} from './insights';

// A fixed "now" so every assertion is about the arithmetic rather than the
// day it happens to run. 15:30 local, so a UTC-vs-local mix-up in the day
// boundaries shows up instead of hiding behind midnight.
const NOW = new Date(2026, 2, 18, 15, 30, 0);
const dayKey = (y: number, m: number, d: number) =>
  new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

describe('parseRangeDays', () => {
  it('accepts the two offered ranges', () => {
    expect(parseRangeDays('7')).toBe(7);
    expect(parseRangeDays('30')).toBe(30);
  });

  it('falls back to the default for anything else', () => {
    for (const value of [undefined, '', '14', '0', '-7', 'seven', 'abc']) {
      expect(parseRangeDays(value), String(value)).toBe(DEFAULT_RANGE_DAYS);
    }
  });

  it('reads a leading number, like parsePage and parseStatus already do', () => {
    // `Number.parseInt` stops at the first non-digit, so trailing junk is
    // ignored rather than rejected. Harmless and deliberate: the result is
    // still checked against the allow-list, so "7days" can only ever mean 7.
    expect(parseRangeDays('7days')).toBe(7);
    expect(parseRangeDays('30.9')).toBe(30);
  });
});

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

  it('isSecurityEventType rejects codes the schema does not have', () => {
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

describe('rangeWindow', () => {
  it('covers exactly the last 7 days, ending today, half-open', () => {
    const range = rangeWindow(7, NOW);
    expect(dayKeyFrom(range.from)).toBe(dayKey(2026, 2, 12));
    expect(dayKeyFrom(range.to)).toBe(dayKey(2026, 2, 19));
    expect(dayCount(range)).toBe(7);
  });

  it('covers exactly the last 30 days', () => {
    const range = rangeWindow(30, NOW);
    expect(dayKeyFrom(range.from)).toBe(dayKey(2026, 1, 17));
    expect(dayKeyFrom(range.to)).toBe(dayKey(2026, 2, 19));
    expect(dayCount(range)).toBe(30);
  });

  it('buckets by the server calendar day, not the UTC one', () => {
    // 23:30 local on the 18th is still the 18th locally; a UTC-keyed window
    // would have rolled forward a day for a server east of Greenwich.
    const lateEvening = new Date(2026, 2, 18, 23, 30);
    const range = rangeWindow(7, lateEvening);
    expect(dayCount(range)).toBe(7);
    expect(dayKeyFrom(range.to)).toBe(dayKey(2026, 2, 19));
  });
});

describe('dailySeriesForWindow', () => {
  const window = rangeWindow(7, NOW);

  it('zero-fills the days that have no rows', () => {
    const filled = dailySeriesForWindow(
      [
        { date: new Date(Date.UTC(2026, 2, 12)), count: 5 },
        { date: new Date(Date.UTC(2026, 2, 18)), count: 9 },
      ],
      window
    );
    expect(filled).toHaveLength(7);
    expect(filled.map((day) => day.count)).toEqual([5, 0, 0, 0, 0, 0, 9]);
    expect(filled[0].date.toISOString().slice(0, 10)).toBe('2026-03-12');
    expect(filled.at(-1)!.date.toISOString().slice(0, 10)).toBe('2026-03-18');
  });

  it('returns a full run of zeros when nothing was recorded', () => {
    const filled = dailySeriesForWindow([], window);
    expect(filled).toHaveLength(7);
    expect(filled.every((day) => day.count === 0)).toBe(true);
  });

  it('matches on the day key, so a row with a time still lands on its day', () => {
    const filled = dailySeriesForWindow(
      [{ date: new Date(Date.UTC(2026, 2, 15, 13, 37)), count: 3 }],
      window
    );
    expect(
      filled
        .find((day) => day.count === 3)
        ?.date.toISOString()
        .slice(0, 10)
    ).toBe('2026-03-15');
  });
});

describe('trendBars', () => {
  const window7 = rangeWindow(7, NOW);
  const points = dailySeriesForWindow(
    [
      { date: new Date(Date.UTC(2026, 2, 12)), count: 10 },
      { date: new Date(Date.UTC(2026, 2, 14)), count: 30 },
      { date: new Date(Date.UTC(2026, 2, 18)), count: 20 },
    ],
    window7
  );

  it('draws one bar per day, oldest first, left to right', () => {
    const bars = trendBars(points);
    expect(bars).toHaveLength(7);
    // The window is 12th..18th, so the 30 sits on the 14th: third bar.
    expect(bars.map((bar) => bar.count)).toEqual([10, 0, 30, 0, 0, 0, 20]);
    for (let i = 1; i < bars.length; i += 1) {
      expect(bars[i].x, `bar ${i} is right of bar ${i - 1}`).toBeGreaterThan(
        bars[i - 1].x
      );
    }
  });

  it('scales heights against the busiest day and keeps them inside the plot', () => {
    const bars = trendBars(points);
    const plotHeight = TREND.height - TREND.paddingTop - TREND.paddingBottom;
    const tallest = bars.reduce((best, bar) =>
      bar.height > best.height ? bar : best
    );
    expect(tallest.count).toBe(30);
    expect(tallest.height).toBeCloseTo(plotHeight, 1);
    for (const bar of bars) {
      expect(bar.height).toBeGreaterThanOrEqual(0);
      expect(bar.height).toBeLessThanOrEqual(plotHeight);
      expect(bar.y).toBeGreaterThanOrEqual(TREND.paddingTop - 0.01);
      // Baseline: every bar's bottom edge sits on the plot floor.
      expect(bar.y + bar.height).toBeCloseTo(TREND.paddingTop + plotHeight, 1);
    }
  });

  it('never draws a bar wider than the cap, however few days there are', () => {
    for (const bar of trendBars(points)) {
      expect(bar.width).toBeLessThanOrEqual(TREND.maxBarWidth);
      expect(bar.width).toBeGreaterThan(0);
    }
  });

  it('draws a flat baseline instead of dividing by zero on an empty window', () => {
    const bars = trendBars(dailySeriesForWindow([], window7));
    expect(bars).toHaveLength(7);
    expect(bars.every((bar) => bar.height === 0)).toBe(true);
  });

  it('survives an empty point list', () => {
    expect(trendBars([])).toEqual([]);
  });
});

describe('trendLabelStep', () => {
  it('labels every bar on a short range and thins a long one', () => {
    expect(trendLabelStep(7)).toBe(1);
    expect(trendLabelStep(30)).toBe(5);
    expect(trendLabelStep(8)).toBe(1);
    expect(trendLabelStep(16)).toBe(2);
  });
});

// Helpers kept at the bottom so the assertions above read as the subject.
function dayKeyFrom(date: Date) {
  return date.toISOString().slice(0, 10);
}
function dayCount(range: { from: Date; to: Date }) {
  return Math.round((range.to.getTime() - range.from.getTime()) / 86400000);
}
