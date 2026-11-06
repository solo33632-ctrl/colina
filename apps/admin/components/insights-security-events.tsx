import { getLocale, getTranslations } from 'next-intl/server';
import type { SecurityEventType } from '@colina/db';
import type { SecurityEventRow } from '@/lib/insights-security';
import { intlLocale, relativeTime } from '@/lib/format';

const TYPE_BADGES: Record<SecurityEventType, string> = {
  RATE_LIMITED: 'border-amber-300 bg-amber-50 text-amber-900',
  HONEYPOT_CAUGHT: 'border-brand-300 bg-brand-50 text-brand-800',
  LOGIN_FAILED: 'border-stone-300 bg-stone-100 text-stone-800',
};

// Recent events, newest first. A real table from `md` up; below that the same
// rows become cards, so a narrow phone never needs a horizontal scrollbar. The
// masked IP is the only address that exists by the time this component runs —
// the data layer has already removed the last IPv4 octet / most of an IPv6.
export async function InsightsSecurityEvents({
  events,
  now,
}: {
  events: SecurityEventRow[];
  now: Date;
}) {
  const locale = await getLocale();
  const adminLocale = locale as 'ar' | 'en';
  const t = await getTranslations('Insights');
  const common = await getTranslations('Common');
  const intl = intlLocale(adminLocale);

  const typeLabel = (type: SecurityEventType) => t(`eventTypes.${type}`);
  const typeBadge = (type: SecurityEventType) => (
    <span
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium ${TYPE_BADGES[type]}`}
    >
      {typeLabel(type)}
    </span>
  );
  const relative = (date: Date) =>
    relativeTime(date, adminLocale, now) ?? t('justNow');
  const full = (date: Date) =>
    new Intl.DateTimeFormat(intl, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);

  return (
    <>
      <div className="mt-6 hidden overflow-x-auto rounded-xl border border-stone-200 bg-white shadow-sm md:block">
        <table
          aria-label={t('eventsHeading')}
          data-testid="insights-security-events-table"
          className="w-full text-start text-sm"
        >
          <thead>
            <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('timeColumn')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('typeColumn')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('targetColumn')}
              </th>
              <th scope="col" className="px-4 py-3 font-semibold">
                {t('sourceColumn')}
              </th>
            </tr>
          </thead>
          <tbody>
            {events.map((event) => (
              <tr
                key={event.id}
                data-testid="insights-security-event"
                className="border-b border-stone-100 last:border-b-0 hover:bg-stone-50"
              >
                <td className="whitespace-nowrap px-4 py-3 align-top">
                  <time
                    dateTime={event.createdAt.toISOString()}
                    className="block text-stone-900"
                  >
                    {relative(event.createdAt)}
                  </time>
                  <time
                    dateTime={event.createdAt.toISOString()}
                    className="mt-0.5 block text-xs text-stone-500"
                  >
                    {full(event.createdAt)}
                  </time>
                </td>
                <td className="px-4 py-3 align-top">{typeBadge(event.type)}</td>
                <td className="px-4 py-3 align-top">
                  <span
                    dir="ltr"
                    className="block max-w-[16rem] break-all font-mono text-xs text-stone-700"
                  >
                    {event.target}
                  </span>
                </td>
                <td className="px-4 py-3 align-top">
                  {event.maskedIp ? (
                    <span
                      dir="ltr"
                      className="whitespace-nowrap font-mono text-xs text-stone-700"
                    >
                      {event.maskedIp}
                    </span>
                  ) : (
                    <span className="text-stone-400">{common('none')}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul
        className="mt-6 grid gap-3 md:hidden"
        data-testid="insights-security-events-cards"
      >
        {events.map((event) => (
          <li
            key={event.id}
            data-testid="insights-security-event-card"
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-sm"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              {typeBadge(event.type)}
              <time
                dateTime={event.createdAt.toISOString()}
                className="text-xs text-stone-500"
              >
                {relative(event.createdAt)}
              </time>
            </div>
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs text-stone-500">{t('targetColumn')}</dt>
                <dd
                  dir="ltr"
                  className="break-all font-mono text-xs text-stone-700"
                >
                  {event.target}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs text-stone-500">{t('sourceColumn')}</dt>
                <dd
                  dir="ltr"
                  className="break-all font-mono text-xs text-stone-700"
                >
                  {event.maskedIp ?? common('none')}
                </dd>
              </div>
              <div className="col-span-2">
                <dt className="text-xs text-stone-500">{t('recordedAt')}</dt>
                <dd>
                  <time
                    dateTime={event.createdAt.toISOString()}
                    className="text-xs text-stone-600"
                  >
                    {full(event.createdAt)}
                  </time>
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
