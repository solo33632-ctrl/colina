import { getLocale, getTranslations } from 'next-intl/server';
import type { TrafficReport } from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';
import { InsightsChange } from '@/components/insights-change';
import { MetricCard } from '@/components/metric-card';

// The four numbers that answer "what happened in this window?".
//
// The change against the previous period is always spelled out in words and
// an arrow as well as colour: a red/green tint alone is not a signal every
// operator can read.
export async function InsightsTrafficKpis({
  report,
}: {
  report: TrafficReport;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const number = (value: number) => value.toLocaleString(intl);
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);
  const date = (value: Date) =>
    new Intl.DateTimeFormat(intl, {
      day: 'numeric',
      month: 'short',
    }).format(value);

  const ar = report.locales.find((row) => row.locale === 'ar');
  const en = report.locales.find((row) => row.locale === 'en');

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label={t('totalViews')}
        count={report.total}
        value={number(report.total)}
        testId="insights-total-views"
        detail={<InsightsChange changePercent={report.changePercent} />}
      />
      <MetricCard
        label={t('averagePerDay')}
        count={report.averagePerDay}
        testId="insights-average-per-day"
        value={report.averagePerDay.toLocaleString(intl, {
          maximumFractionDigits: 1,
        })}
        detail={
          <span className="font-medium text-stone-500">
            {t('averageDetail', { days: report.days })}
          </span>
        }
      />
      <MetricCard
        label={t('busiestDay')}
        count={report.busiestDay?.count ?? 0}
        testId="insights-busiest-day"
        value={report.busiestDay ? date(report.busiestDay.date) : t('noVisits')}
        detail={
          <span className="font-medium text-stone-500">
            {report.busiestDay
              ? t('busiestDayViews', {
                  count: number(report.busiestDay.count),
                })
              : t('noVisitsDetail')}
          </span>
        }
      />
      <MetricCard
        label={t('localeSplitLabel')}
        count={report.total}
        testId="insights-locale-split"
        value={
          <div className="grid gap-1 text-base">
            <div className="flex items-center justify-between gap-3">
              <span>{t('localeArabic')}</span>
              <span className="tabular-nums">{percent(ar?.share ?? 0)}</span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span>{t('localeEnglish')}</span>
              <span className="tabular-nums">{percent(en?.share ?? 0)}</span>
            </div>
          </div>
        }
      />
    </div>
  );
}
