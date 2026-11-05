import { getLocale, getTranslations } from 'next-intl/server';
import type { PageLabel, TrafficTopPage } from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';

// The busiest paths, as a horizontal bar list. The friendly label is a reading
// aid; the stored path stays visible in muted monospace so an operator can
// still match it against the address bar or the sitemap.
export async function InsightsTopPages({ pages }: { pages: TrafficTopPage[] }) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const number = (value: number) => value.toLocaleString(intl);
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);

  const labelText = (label: PageLabel) => {
    const key = `pageLabels.${label.key}` as never;
    return label.name ? t(key, { name: label.name } as never) : t(key);
  };

  return (
    <ol data-testid="insights-top-pages" className="grid gap-4">
      {pages.map((page) => (
        <li key={page.path} data-testid="insights-top-page">
          <div className="flex items-baseline justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate font-medium text-stone-900">
                {labelText(page.label)}
              </p>
              <p
                dir="ltr"
                className="truncate font-mono text-xs text-stone-500"
              >
                {page.path}
              </p>
            </div>
            <p className="shrink-0 text-sm tabular-nums text-stone-900">
              <span className="font-semibold">{number(page.total)}</span>
              <span className="text-stone-500">
                {' · '}
                {percent(page.share)}
              </span>
            </p>
          </div>
          <div
            className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100"
            aria-hidden="true"
          >
            <div
              className="h-full rounded-full bg-brand-600"
              style={{ width: `${page.share}%` }}
            />
          </div>
        </li>
      ))}
    </ol>
  );
}
