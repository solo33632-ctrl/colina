import type { ReactNode } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { trafficChange, type ChangeDirection } from '@/lib/insights-traffic';
import { intlLocale } from '@/lib/format';

// A change against the previous equal-length window, always stated as words
// and an arrow as well as colour. Shared by the traffic and security KPIs so
// both halves of the page say "no previous data" the same way.

function ChangeLine({
  direction,
  children,
}: {
  direction: ChangeDirection | null;
  children: ReactNode;
}) {
  if (direction === null) {
    return <span className="font-medium text-stone-500">{children}</span>;
  }

  return (
    <span
      className={
        direction === 'up'
          ? 'font-medium text-green-700'
          : 'font-medium text-red-700'
      }
    >
      <span aria-hidden="true">{direction === 'up' ? '↑' : '↓'}</span>{' '}
      {children}
    </span>
  );
}

function percentFormatter(intl: string) {
  return (value: number) =>
    new Intl.NumberFormat(intl, {
      style: 'percent',
      maximumFractionDigits: 1,
    }).format(value / 100);
}

// Security events: a percentage is always meaningful enough here, and the
// previous-total wording is not "views".
export async function InsightsChange({
  changePercent,
}: {
  changePercent: number | null;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const percent = percentFormatter(intlLocale(locale));

  if (changePercent === null) {
    return <ChangeLine direction={null}>{t('noPrevious')}</ChangeLine>;
  }

  if (changePercent === 0) {
    return <ChangeLine direction={null}>{t('changeSame')}</ChangeLine>;
  }

  const direction: ChangeDirection = changePercent > 0 ? 'up' : 'down';
  return (
    <ChangeLine direction={direction}>
      {t(direction === 'up' ? 'changeUp' : 'changeDown', {
        percent: percent(Math.abs(changePercent)),
      })}
    </ChangeLine>
  );
}

// Traffic views: a small previous window gets an absolute count instead of a
// noisy percentage, and a huge jump is capped at ">999%".
export async function TrafficChange({
  current,
  previous,
}: {
  current: number;
  previous: number;
}) {
  const t = await getTranslations('Insights');
  const locale = await getLocale();
  const intl = intlLocale(locale);
  const percent = percentFormatter(intl);
  const number = (value: number) => value.toLocaleString(intl);
  const display = trafficChange(current, previous);

  switch (display.kind) {
    case 'empty':
      return <ChangeLine direction={null}>{t('noPrevious')}</ChangeLine>;
    case 'same':
      return <ChangeLine direction={null}>{t('changeSame')}</ChangeLine>;
    case 'absolute':
      return (
        <ChangeLine direction={display.direction}>
          {t(display.direction === 'up' ? 'changeUpViews' : 'changeDownViews', {
            count: number(display.count),
          })}
        </ChangeLine>
      );
    case 'percent':
      return (
        <ChangeLine direction={display.direction}>
          {t(display.direction === 'up' ? 'changeUp' : 'changeDown', {
            percent: `${display.capped ? '>' : ''}${percent(display.percent)}`,
          })}
        </ChangeLine>
      );
  }
}
