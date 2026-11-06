import { getLocale, getTranslations } from 'next-intl/server';
import type { SecurityEventType } from '@colina/db';
import type { SecurityReport } from '@/lib/insights-security';
import { intlLocale } from '@/lib/format';
import { InsightsChange } from '@/components/insights-change';
import { MetricCard } from '@/components/metric-card';

const TYPE_TEST_IDS: Record<SecurityEventType, string> = {
  RATE_LIMITED: 'insights-security-rate-limited',
  HONEYPOT_CAUGHT: 'insights-security-honeypot-caught',
  LOGIN_FAILED: 'insights-security-login-failed',
};

// The total and one card per stored type. Every delta is written out, so an
// operator does not have to infer the direction from a colour. The one-line
// hint under each type says what actually happened, not just the code name.
export async function InsightsSecurityKpis({
  report,
}: {
  report: SecurityReport;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const number = (value: number) => value.toLocaleString(intl);

  return (
    <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard
        label={t('totalEvents')}
        count={report.total}
        value={number(report.total)}
        testId="insights-security-total"
        detail={<InsightsChange changePercent={report.changePercent} />}
      />
      {report.types.map((row) => (
        <MetricCard
          key={row.type}
          label={t(`eventTypes.${row.type}`)}
          count={row.total}
          value={number(row.total)}
          tone="alert"
          testId={TYPE_TEST_IDS[row.type]}
          detail={
            <div className="grid gap-1">
              <InsightsChange changePercent={row.changePercent} />
              <span className="text-stone-600">
                {t(`eventTypeHints.${row.type}`)}
              </span>
            </div>
          }
        />
      ))}
    </div>
  );
}
