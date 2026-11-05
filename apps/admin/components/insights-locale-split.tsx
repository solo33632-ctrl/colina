import { getLocale, getTranslations } from 'next-intl/server';
import type { TrafficLocaleTotal } from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';

const LOCALE_COLORS: Record<string, string> = {
  ar: 'bg-brand-700',
  en: 'bg-brand-300',
};

// Arabic vs English as one two-segment bar, with the exact counts and shares
// in the legend. The bar is decorative; the legend is the accessible content.
export async function InsightsLocaleSplit({
  locales,
}: {
  locales: TrafficLocaleTotal[];
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
  const label = (code: string) =>
    code === 'ar' ? t('localeArabic') : t('localeEnglish');

  return (
    <div data-testid="insights-locale-split-chart">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-stone-100"
        aria-hidden="true"
      >
        {locales
          .filter((row) => row.total > 0)
          .map((row) => (
            <div
              key={row.locale}
              className={LOCALE_COLORS[row.locale] ?? 'bg-stone-400'}
              style={{ width: `${row.share}%` }}
            />
          ))}
      </div>
      <ul className="mt-3 grid gap-2 text-sm">
        {locales.map((row) => (
          <li
            key={row.locale}
            className="flex items-center justify-between gap-2"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-sm ${
                  LOCALE_COLORS[row.locale] ?? 'bg-stone-400'
                }`}
                aria-hidden="true"
              />
              <span className="truncate text-stone-700">
                {label(row.locale)}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-stone-500">
              {number(row.total)} · {percent(row.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
