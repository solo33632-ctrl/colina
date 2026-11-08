import { getLocale, getTranslations } from 'next-intl/server';
import type { SecurityEventType } from '@colina/db';
import {
  SECURITY_EVENT_TYPES,
  type SecurityReport,
} from '@/lib/insights-security';
import { intlLocale } from '@/lib/format';

// Hand-built stacked columns: one column per day, one segment per event type.
// No charting dependency. The chart is always LTR (time flows left to right)
// while every label is localized, and its exact values are available in the
// hidden table below it.
const CHART = {
  width: 720,
  height: 300,
  left: 44,
  right: 16,
  top: 16,
  bottom: 40,
} as const;

const TYPE_COLORS: Record<SecurityEventType, { fill: string; swatch: string }> =
  {
    RATE_LIMITED: {
      fill: 'fill-chart-security-rate',
      swatch: 'bg-chart-security-rate',
    },
    HONEYPOT_CAUGHT: {
      fill: 'fill-chart-security-honeypot',
      swatch: 'bg-chart-security-honeypot',
    },
    LOGIN_FAILED: {
      fill: 'fill-chart-security-login',
      swatch: 'bg-chart-security-login',
    },
  };

// Solid, diagonal hatch and dots: the three series stay distinguishable in
// greyscale, for colour-blind operators and in a printed screenshot, not only
// by hue. The legend repeats the same pattern beside each label, so the
// mapping is readable without decoding colour.
const TYPE_PATTERNS: Record<SecurityEventType, string | null> = {
  RATE_LIMITED: null,
  HONEYPOT_CAUGHT: 'security-honeypot-hatch',
  LOGIN_FAILED: 'security-login-dots',
};

type Scale = { max: number; ticks: number[] };

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

export async function InsightsSecurityChart({
  report,
}: {
  report: SecurityReport;
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

  const { series } = report;
  if (series.length === 0) {
    return null;
  }

  const scale = niceScale(Math.max(...series.map((day) => day.total)));
  const plotWidth = CHART.width - CHART.left - CHART.right;
  const plotHeight = CHART.height - CHART.top - CHART.bottom;
  const baseline = CHART.top + plotHeight;
  const band = plotWidth / series.length;
  const barWidth = Math.max(2, Math.min(36, band * 0.68));

  const x = (index: number) =>
    Math.round((CHART.left + band * index + (band - barWidth) / 2) * 100) / 100;
  const heightFor = (count: number) =>
    Math.round((count / scale.max) * plotHeight * 100) / 100;

  const summary = t('securityTrendSummary', {
    days: number(report.days),
    total: number(report.total),
  });
  const step = labelStep(series.length);

  return (
    <figure className="min-w-0" dir="ltr" data-testid="insights-security-chart">
      <svg
        viewBox={`0 0 ${CHART.width} ${CHART.height}`}
        role="img"
        aria-label={summary}
        className="h-auto w-full max-w-[720px]"
      >
        <title>{summary}</title>

        <defs>
          <pattern
            id="security-honeypot-hatch"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <path d="M0 0h6v6H0z" className="fill-chart-security-honeypot" />
            <path
              d="M0 0v6"
              strokeWidth="1.5"
              className="stroke-chart-pattern-ink"
            />
          </pattern>
          <pattern
            id="security-login-dots"
            width="6"
            height="6"
            patternUnits="userSpaceOnUse"
          >
            <path d="M0 0h6v6H0z" className="fill-chart-security-login" />
            <circle
              cx="1.5"
              cy="1.5"
              r="1"
              className="fill-chart-pattern-ink"
            />
          </pattern>
        </defs>

        {scale.ticks.map((tick) => {
          const y = baseline - (tick / scale.max) * plotHeight;
          return (
            <g key={tick}>
              <line
                x1={CHART.left}
                y1={y}
                x2={CHART.width - CHART.right}
                y2={y}
                strokeWidth="1"
                className={
                  tick === 0 ? 'stroke-chart-grid' : 'stroke-chart-grid-muted'
                }
              />
              <text
                x={CHART.left - 8}
                y={y + 4}
                textAnchor="end"
                className="fill-chart-axis text-[11px]"
              >
                {number(tick)}
              </text>
            </g>
          );
        })}

        {series.map((day, index) => {
          let stacked = 0;
          const bars = SECURITY_EVENT_TYPES.map((type) => {
            const count = day.counts[type];
            if (count <= 0) {
              return null;
            }
            const height = heightFor(count);
            const y = baseline - stacked - height;
            stacked += height;
            return {
              type,
              y: Math.round(y * 100) / 100,
              height,
            };
          }).filter((bar): bar is NonNullable<typeof bar> => bar !== null);

          const label = t('securityTrendPointLabel', {
            date: fullDate(day.date),
            count: number(day.total),
          });

          return (
            <g
              key={day.date.toISOString()}
              tabIndex={0}
              role="img"
              aria-label={label}
              className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              <title>{label}</title>
              {bars.map((bar) => {
                const pattern = TYPE_PATTERNS[bar.type];
                return (
                  <rect
                    key={bar.type}
                    x={x(index)}
                    y={bar.y}
                    width={barWidth}
                    height={bar.height}
                    className={pattern ? undefined : TYPE_COLORS[bar.type].fill}
                    fill={pattern ? `url(#${pattern})` : undefined}
                  />
                );
              })}
            </g>
          );
        })}

        {series.map((day, index) =>
          index % step === 0 || index === series.length - 1 ? (
            <text
              key={`label-${day.date.toISOString()}`}
              x={x(index) + barWidth / 2}
              y={baseline + 20}
              textAnchor="middle"
              className="fill-chart-axis text-[11px]"
            >
              {shortDate(day.date)}
            </text>
          ) : null
        )}
      </svg>

      <ul className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600">
        {report.types.map((row) => {
          const pattern = TYPE_PATTERNS[row.type];
          return (
            <li key={row.type} className="inline-flex items-center gap-2">
              {pattern ? (
                <svg
                  viewBox="0 0 10 10"
                  className="h-2.5 w-2.5 shrink-0"
                  aria-hidden="true"
                >
                  <path d="M0 0h10v10H0z" fill={`url(#${pattern})`} />
                </svg>
              ) : (
                <span
                  className={`h-2.5 w-2.5 shrink-0 rounded-sm ${TYPE_COLORS[row.type].swatch}`}
                  aria-hidden="true"
                />
              )}
              <span>{t(`eventTypes.${row.type}`)}</span>
              <span className="tabular-nums text-stone-500">
                {number(row.total)}
              </span>
            </li>
          );
        })}
      </ul>

      {/* A wrapper clips a wide data table to the 1px accessible box; putting
          `sr-only` on the table itself would still let its min-content width
          widen the document at 390px. */}
      <div className="sr-only">
        <table data-testid="insights-security-chart-table">
          <caption>{t('securityTrendTableCaption')}</caption>
          <thead>
            <tr>
              <th scope="col">{t('tableDate')}</th>
              {SECURITY_EVENT_TYPES.map((type) => (
                <th key={type} scope="col">
                  {t(`eventTypes.${type}`)}
                </th>
              ))}
              <th scope="col">{t('totalEvents')}</th>
            </tr>
          </thead>
          <tbody>
            {series.map((day) => (
              <tr key={day.date.toISOString()}>
                <th scope="row">{fullDate(day.date)}</th>
                {SECURITY_EVENT_TYPES.map((type) => (
                  <td key={type}>{number(day.counts[type])}</td>
                ))}
                <td>{number(day.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
