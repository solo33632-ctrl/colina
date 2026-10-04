import { getLocale, getTranslations } from 'next-intl/server';
import type { DailyViews } from '@colina/db';
import { trendBars, trendLabelStep, TREND } from '@/lib/insights';
import { intlLocale } from '@/lib/format';

// The per-day traffic trend, drawn as an inline SVG bar chart.
//
// No charting dependency: one `<rect>` per day plus a text label, which is why
// the geometry is a pure function in `lib/insights.ts` (unit-tested) and this
// file only decides what to draw.
//
// Three deliberate choices:
//
//   - Oldest on the left in BOTH locales. SVG coordinates do not flip with
//     `dir`, so a mirrored chart would silently disagree with the page's own
//     reading order in Arabic. A mirrored time axis is a known RTL readability
//     trap, and a chart that reads the same way in both languages is worth more
//     than one that mirrors. The labels themselves are localised, so Arabic
//     readers get Arabic-Indic digits regardless.
//   - The SVG is capped at its natural width, because `viewBox` + `w-full`
//     scales text along with the bars: allowed to stretch, a 700-unit chart in a
//     1100px card would render its axis labels at 16px.
//   - Below `sm` the axis labels are dropped rather than shrunk. A 30-bar chart
//     at phone width scales its labels to roughly 5px — smaller than useless and
//     worse than none. The per-day numbers stay reachable in each bar's tooltip
//     and in the screen-reader list below, so nothing is lost but the pixels.
export async function InsightsTrendChart({ days }: { days: DailyViews[] }) {
  const locale = await getLocale();
  const t = await getTranslations('Insights');
  const intl = intlLocale(locale);

  // Drawn height for a day with no views. Presentation-only, so it lives here
  // rather than in the tested geometry function: `bar.height === 0` stays the
  // truthful answer to "how tall is this bar", and the stub is how a zero is
  // made visible.
  const ZERO_BAR_HEIGHT = 2;

  const bars = trendBars(days);
  const labelEvery = trendLabelStep(bars.length);
  // The floor every bar stands on: the bottom of the plot area.
  const baselineY = TREND.height - TREND.paddingBottom;

  const dayLabel = (date: Date) =>
    new Intl.DateTimeFormat(intl, { day: 'numeric', month: 'short' }).format(
      date
    );
  const fullLabel = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);

  const total = days.reduce((sum, day) => sum + day.count, 0);
  const summary = t('trendSummary', { total, days: days.length });

  return (
    <figure className="mt-4">
      <svg
        viewBox={`0 0 ${TREND.width} ${TREND.height}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full max-w-[700px]"
      >
        <title>{summary}</title>
        <line
          x1={TREND.paddingX}
          y1={baselineY}
          x2={TREND.width - TREND.paddingX}
          y2={baselineY}
          strokeWidth="1"
          className="stroke-stone-300"
        />
        {bars.map((bar, index) => {
          // A zero-height bar is invisible, which would make a quiet stretch
          // of the window look like the window was shorter than it is. So a day
          // with no views gets a 2-unit stub in pale grey: unmistakably "none",
          // and it keeps the axis showing every day that was asked about.
          const drawnHeight = bar.height === 0 ? ZERO_BAR_HEIGHT : bar.height;
          return (
            <g key={bar.date.toISOString()}>
              <rect
                x={bar.x}
                y={baselineY - drawnHeight}
                width={bar.width}
                height={drawnHeight}
                rx="2"
                className={
                  bar.count === 0 ? 'fill-stone-200' : 'fill-brand-600'
                }
              >
                {/* The tooltip is the one-bar-at-a-time label. */}
                <title>{`${fullLabel(bar.date)} — ${bar.count.toLocaleString(intl)}`}</title>
              </rect>
              {index % labelEvery === 0 || index === bars.length - 1 ? (
                <text
                  x={bar.x + bar.width / 2}
                  y={baselineY + 16}
                  textAnchor="middle"
                  className="fill-stone-500 text-[11px] max-sm:hidden"
                >
                  {dayLabel(bar.date)}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      {/* The chart's numbers, for anyone the picture does not serve. */}
      <dl className="sr-only">
        {days.map((day) => (
          <div key={day.date.toISOString()}>
            <dt>{fullLabel(day.date)}</dt>
            <dd>{day.count.toLocaleString(intl)}</dd>
          </div>
        ))}
      </dl>
    </figure>
  );
}
