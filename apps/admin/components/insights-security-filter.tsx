import { getTranslations } from 'next-intl/server';
import type { SecurityEventType } from '@colina/db';
import { SECURITY_EVENT_TYPES } from '@/lib/insights-security';
import { Link } from '@/i18n/navigation';

// Event-type filter as links rather than a form: every choice is a URL, so it
// survives a refresh and the browser's back button. The shared range rides
// along on every option, and selecting a type starts again at page 1.
export async function InsightsSecurityFilter({
  selected,
  rangeDays,
}: {
  selected?: SecurityEventType;
  rangeDays: number;
}) {
  const t = await getTranslations('Insights');

  const href = (type?: SecurityEventType) => {
    const query = new URLSearchParams();
    query.set('range', String(rangeDays));
    if (type) {
      query.set('type', type);
    }
    return `/insights?${query.toString()}`;
  };

  const options: Array<{ type?: SecurityEventType; label: string }> = [
    { label: t('allTypes') },
    ...SECURITY_EVENT_TYPES.map((type) => ({
      type,
      label: t(`eventTypes.${type}`),
    })),
  ];

  return (
    <nav
      aria-label={t('filterByType')}
      data-testid="insights-security-filter"
      className="flex flex-wrap gap-2"
    >
      {options.map((option) => {
        const active = option.type === selected;
        return (
          <Link
            key={option.type ?? 'all'}
            href={href(option.type)}
            aria-current={active ? 'page' : undefined}
            className={[
              'rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
              active
                ? 'border-brand-600 bg-brand-600 text-white'
                : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-100',
            ].join(' ')}
          >
            {option.label}
          </Link>
        );
      })}
    </nav>
  );
}
