import { getLocale, getTranslations } from 'next-intl/server';
import type { TrafficReport } from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';

// Hand-built inline SVG: no charting dependency, and the geometry is simple
// enough to keep in the component. The chart is always LTR (time flows left to
// right in both languages) while every label is localized.
const CHART = {
  width: 720,
  height: 260,
  left: 44,
  right: 16,
  top: 16,
  bottom: 34,
} as const;

type Scale = { max: number; ticks: number[] };

/**
 * Rounded axis ticks (0, 2, 4, 6… rather than 0, 1.73, 3.46…). The tick count
 * is a target, not a promise: the step is snapped to 1/2/5/10 so the labels
 * stay readable. Views are counts, so the step never goes below 1.
 */
function niceScale(maxValue: number): Scale {
  const safe = Math.max(1, maxValue);
  const rough = safe / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / power;
  const step = Math.max(
    1,
    (normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10) *
      power
  );
  const max = Math.ceil(safe / step) * step;
  const ticks: number[] = [];
  for (let value = 0; value <= max; value += step) {
    ticks.push(Math.round(value * 1_000_000) / 1_000_000);
  }
  return { max, ticks };
}

function labelStep(count: number): number {
  return count <= 7 ? 1 : Math.ceil(count / 6);
}

export async function InsightsTrendChart({
  report,
}: {
  report: TrafficReport;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const number = (value: number) => value.toLocaleString(intl);
  const shortDate = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      day: 'numeric',
      month: 'short',
    }).format(date);
  const fullDate = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    }).format(date);

  const { series, previousSeries } = report;
  if (series.length === 0) {
    return null;
  }

  const scale = niceScale(
    Math.max(
      ...series.map((day) => day.count),
      ...previousSeries.map((day) => day.count)
    )
  );
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const baseline = CHART.top + plotHeight;

  const x = (index: number) =>
    CHART.left +
    (series.length === 1
      ? plotWidth / 2
      : (index / (series.length - 1)) * plotWidth);
  const y = (count: number) =>
    CHART.top + plotHeight - (count / scale.max) * plotHeight;

  const points = series.map((day, index) => ({
    day,
    x: Math.round(x(index) * 100) / 100,
    y: Math.round(y(day.count) * 100) / 100,
  }));
  const previousPoints = previousSeries.map((day, index) => ({
    day,
    x: Math.round(x(index) * 100) / 100,
    y: Math.round(y(day.count) * 100) / 100,
  }));

  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');
  const areaPath = `M${points[0].x} ${baseline} ${linePath.replace(
    /^M/,
    'L'
  )} L${points[points.length - 1].x} ${baseline} Z`;
  const previousPath = previousPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`)
    .join(' ');

  const step = labelStep(series.length);
  const total = report.total;
  const summary = t('trendSummary', { total, days: report.days });
  const showPrevious = report.previousTotal > 0;

  return (
    <figure className="min-w-0" dir="ltr" data-testid="insights-traffic-chart">
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full max-w-[720px]"
      >
        <title>{summary}</title>

        {scale.ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={CHART.left}
              y1={y(tick)}
              x2={CHART.width - CHART.right}
              y2={y(tick)}
              strokeWidth="1"
              className={
                tick === 0 ? 'stroke-chart-grid' : 'stroke-chart-grid-muted'
              }
            />
            <text
              x={CHART.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="fill-chart-axis text-[11px]"
            >
              {number(tick)}
            </text>
          </g>
        ))}

        <path d={areaPath} className="fill-chart-brand-area" />
        {showPrevious ? (
          <path
            d={previousPath}
            fill="none"
            strokeWidth="1.5"
            strokeDasharray="4 4"
            className="stroke-chart-previous"
          />
        ) : null}
        <path
          d={linePath}
          fill="none"
          strokeWidth="2.5"
          strokeLinejoin="round"
          strokeLinecap="round"
          className="stroke-chart-brand-line"
        />

        {points.map((point) => {
          const label = t('trendPointLabel', {
            date: fullDate(point.day.date),
            count: number(point.day.count),
          });
          return (
            <g
              key={point.day.date.toISOString()}
              tabIndex={0}
              role="img"
              aria-label={label}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <circle
                cx={point.x}
                cy={point.y}
                r="2.5"
                className="fill-chart-brand-line"
              />
              <title>{label}</title>
            </g>
          );
        })}

        {points.map((point, index) =>
          index % step === 0 || index === points.length - 1 ? (
            <text
              key={`label-${point.day.date.toISOString()}`}
              x={point.x}
              y={baseline + 20}
              textAnchor="middle"
              className="fill-chart-axis text-[11px]"
            >
              {shortDate(point.day.date)}
            </text>
          ) : null
        )}
      </svg>

      {showPrevious ? (
        <div className="mt-2 flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-stone-600">
          <span className="inline-flex items-center gap-2">
            <span
              className="h-0.5 w-4 rounded bg-chart-brand-line"
              aria-hidden="true"
            />
            {t('trendLegendCurrent')}
          </span>
          <span className="inline-flex items-center gap-2">
            <span
              className="h-0.5 w-4 border-t-2 border-dashed border-chart-previous"
              aria-hidden="true"
            />
            {t('trendLegendPrevious')}
          </span>
        </div>
      ) : null}

      {/* The same numbers as a table, for screen readers and keyboard users
          who would rather read than inspect points. */}
      <table className="sr-only">
        <caption>{t('trendTableCaption')}</caption>
        <thead>
          <tr>
            <th scope="col">{t('tableDate')}</th>
            <th scope="col">{t('tableViews')}</th>
            <th scope="col">{t('tablePrevious')}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((day, index) => (
            <tr key={day.date.toISOString()}>
              <th scope="row">{fullDate(day.date)}</th>
              <td>{number(day.count)}</td>
              <td>{number(previousSeries[index]?.count ?? 0)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
