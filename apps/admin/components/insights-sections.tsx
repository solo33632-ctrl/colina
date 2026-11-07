import { getLocale, getTranslations } from 'next-intl/server';
import type {
  TrafficSection,
  TrafficSectionTotal,
} from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';

const SECTION_COLORS: Record<TrafficSection, string> = {
  home: 'bg-chart-section-home',
  machines: 'bg-chart-section-machines',
  categories: 'bg-chart-section-categories',
  maintenance: 'bg-chart-section-maintenance',
  contact: 'bg-chart-section-contact',
  other: 'bg-chart-section-other',
};

// A stacked bar gives the shape of the window at a glance; the list beside it
// carries the exact numbers, so the breakdown never relies on colour alone.
export async function InsightsSections({
  sections,
}: {
  sections: TrafficSectionTotal[];
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

  return (
    <div data-testid="insights-sections">
      <div
        className="flex h-3 overflow-hidden rounded-full bg-stone-100"
        role="img"
        aria-label={t('sectionsHeading')}
      >
        {sections
          .filter((section) => section.total > 0)
          .map((section) => (
            <div
              key={section.section}
              className={SECTION_COLORS[section.section]}
              style={{ width: `${section.share}%` }}
              title={`${t(`sectionLabels.${section.section}`)}: ${number(
                section.total
              )} (${percent(section.share)})`}
            />
          ))}
      </div>
      <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
        {sections.map((section) => (
          <li
            key={section.section}
            className="flex items-center justify-between gap-2 text-sm"
          >
            <span className="flex min-w-0 items-center gap-2">
              <span
                className={`h-2.5 w-2.5 shrink-0 rounded-sm ${
                  SECTION_COLORS[section.section]
                }`}
                aria-hidden="true"
              />
              <span className="truncate text-stone-700">
                {t(`sectionLabels.${section.section}`)}
              </span>
            </span>
            <span className="shrink-0 tabular-nums text-stone-500">
              {number(section.total)} · {percent(section.share)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
