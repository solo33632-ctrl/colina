import { getTranslations } from 'next-intl/server';
import { RANGE_DAYS } from '@/lib/insights';

// The dashboard's single date-range control, shared by the traffic and the
// security section (one question — "over what period?" — so one answer).
//
// A GET form with one submit button per range rather than links or a
// client-side toggle: choosing a range is a navigation, so it has to work with
// JavaScript off, put the choice in the URL (shareable, survives a reload) and
// leave the rest of the query string alone. Submitting sends the button's own
// `name`/`value`, which is why the chosen range replaces the previous one
// instead of accumulating `?range=` twice.
//
// The hidden `type` field preserves the event-type filter: the form submits
// itself, so a filter that is not an input on this page would be lost.
export async function InsightsRangeFilter({
  days,
  eventType,
}: {
  days: number;
  /** Currently filtered event type, if any, so the range switch keeps it. */
  eventType?: string;
}) {
  const t = await getTranslations('Insights');

  return (
    <form method="get" className="mt-6 flex flex-wrap items-center gap-3">
      <span
        id="insights-range-label"
        className="text-sm font-medium text-stone-700"
      >
        {t('rangeLabel')}
      </span>
      <div
        role="group"
        aria-labelledby="insights-range-label"
        className="flex overflow-hidden rounded-lg border border-stone-300"
      >
        {RANGE_DAYS.map((option) => {
          const active = option === days;
          return (
            <button
              key={option}
              type="submit"
              name="range"
              value={option}
              aria-current={active ? 'true' : undefined}
              className={[
                'px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                active
                  ? 'bg-brand-600 text-white'
                  : 'bg-white text-stone-700 hover:bg-stone-100',
              ].join(' ')}
            >
              {t(`ranges.${option}`)}
            </button>
          );
        })}
      </div>
      {eventType ? <input type="hidden" name="type" value={eventType} /> : null}
    </form>
  );
}
