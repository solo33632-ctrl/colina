import { getTranslations } from 'next-intl/server';
import { Button } from '@colina/ui';
import type { SecurityEventType } from '@colina/db';
import { SECURITY_EVENT_TYPES } from '@/lib/insights';

// Event-type filter for the raw events table: a GET form like the leads inbox's
// status filter, so the filtered view is a URL and survives a reload.
//
// The selected range rides along in a hidden field, because this form replaces
// the whole query string on submit — without it, filtering by type would
// silently reset the range back to the default.
export async function InsightsEventFilter({
  selected,
  rangeDays,
}: {
  selected?: SecurityEventType;
  rangeDays: number;
}) {
  const t = await getTranslations('Insights');
  const common = await getTranslations('Common');

  return (
    <form method="get" className="flex flex-wrap items-end gap-3">
      <div>
        <label
          htmlFor="insights-event-type"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('filterByType')}
        </label>
        <select
          id="insights-event-type"
          name="type"
          defaultValue={selected ?? ''}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
        >
          <option value="">{common('all')}</option>
          {SECURITY_EVENT_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`eventTypes.${type}`)}
            </option>
          ))}
        </select>
      </div>
      <input type="hidden" name="range" value={rangeDays} />
      <Button type="submit" variant="secondary" size="sm">
        {common('filter')}
      </Button>
    </form>
  );
}
