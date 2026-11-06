import { getLocale, getTranslations } from 'next-intl/server';
import { intlLocale } from '@/lib/format';

// A change against the previous equal-length window, always stated as words
// and an arrow as well as colour. Shared by the traffic and security KPIs so
// both halves of the page say "no previous data" the same way.
export async function InsightsChange({
  changePercent,
}: {
  changePercent: number | null;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale as 'ar' | 'en');
  const percent = (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);

  if (changePercent === null) {
    return (
      <span className="font-medium text-stone-500">{t('noPrevious')}</span>
    );
  }

  if (changePercent === 0) {
    return (
      <span className="font-medium text-stone-500">{t('changeSame')}</span>
    );
  }

  return (
    <span
      className={
        changePercent > 0
          ? 'font-medium text-green-700'
          : 'font-medium text-red-700'
      }
    >
      <span aria-hidden="true">{changePercent > 0 ? '↑' : '↓'}</span>{' '}
      {t(changePercent > 0 ? 'changeUp' : 'changeDown', {
        percent: percent(Math.abs(changePercent)),
      })}
    </span>
  );
}
