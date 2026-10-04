import type { Metadata } from 'next';
import {
  countSecurityEventsByType,
  listSecurityEvents,
  pageViewDailySeries,
  pageViewTotal,
  topPageViews,
} from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { InsightsEventFilter } from '@/components/insights-event-filter';
import { InsightsEventTable } from '@/components/insights-event-table';
import { InsightsRangeFilter } from '@/components/insights-range-filter';
import { InsightsTopPages } from '@/components/insights-top-pages';
import { InsightsTrendChart } from '@/components/insights-trend-chart';
import { ListPagination } from '@/components/list-pagination';
import { MetricCard } from '@/components/metric-card';
import { Link } from '@/i18n/navigation';
import { requireSuperAdmin } from '@/lib/admin-action';
import {
  clampPage,
  dailySeriesForWindow,
  parseEventType,
  parsePage,
  parseRangeDays,
  rangeWindow,
  SECURITY_EVENT_TYPES,
} from '@/lib/insights';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Insights', 'heading');
}

const PAGE_SIZE = 20;
const TOP_PAGES = 10;

type Props = {
  searchParams: Promise<{ range?: string; type?: string; page?: string }>;
};

// Traffic and security on one page, answering the two questions an operator
// actually has: is anyone looking at the site, and is anyone trying to break
// it. Both read the same date range, because comparing "traffic dipped" with
// "blocked requests spiked" only means anything over one window.
export default async function InsightsPage({ searchParams }: Props) {
  const t = await getTranslations('Insights');

  // Second super-admin-only page in the panel (the audit log is the first).
  // It shows IP addresses and the shape of an attack, so an editor is refused
  // with the same explanatory card rather than a bare 403 — and, as on the
  // audit log, none of the queries below run for them.
  const session = await requireSuperAdmin();
  if (!session) {
    return (
      <main>
        <Container className="max-w-2xl py-16">
          <Card
            title={t('notAuthorizedTitle')}
            description={t('notAuthorizedDescription')}
          />
        </Container>
      </main>
    );
  }

  const params = await searchParams;
  const days = parseRangeDays(params.range);
  const eventType = parseEventType(params.type);
  const page = parsePage(params.page);
  const window = rangeWindow(days);

  const [totalViews, series, topPages, eventsByType, events] =
    await Promise.all([
      pageViewTotal(window),
      pageViewDailySeries(window),
      topPageViews(window, TOP_PAGES),
      // Unfiltered on purpose: the tiles describe the shape of the window, and
      // only the table below answers to the type filter. Filtering the tiles too
      // would make three of them read zero the moment a filter is applied, which
      // looks like a data problem rather than a filter.
      countSecurityEventsByType(window),
      listSecurityEvents({
        range: window,
        type: eventType,
        page,
        pageSize: PAGE_SIZE,
      }),
    ]);

  const totalPages = Math.max(1, Math.ceil(events.total / PAGE_SIZE));
  const safePage = clampPage(page, totalPages);
  // Only a page past the end has to be read again; otherwise the page already
  // fetched is the page being shown.
  const rows =
    safePage === page
      ? events.rows
      : (
          await listSecurityEvents({
            range: window,
            type: eventType,
            page: safePage,
            pageSize: PAGE_SIZE,
          })
        ).rows;

  // Every link on this page carries the other controls forward, so switching
  // the range or the filter never silently resets the page number.
  const href = (overrides: {
    range?: number;
    type?: string | null;
    page?: number;
  }) => {
    const query = new URLSearchParams();
    query.set('range', String(overrides.range ?? days));
    const type = overrides.type === undefined ? eventType : overrides.type;
    if (type) {
      query.set('type', type);
    }
    if (overrides.page) {
      query.set('page', String(overrides.page));
    }
    return `/insights?${query.toString()}`;
  };

  const dailySeries = dailySeriesForWindow(series, window);
  const busiestDay = dailySeries.reduce(
    (max, day) => Math.max(max, day.count),
    0
  );
  const totalEvents = SECURITY_EVENT_TYPES.reduce(
    (sum, type) => sum + eventsByType[type],
    0
  );

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-600">{t('intro')}</p>

        {/* One control for both sections: "over what period?" has one answer. */}
        <InsightsRangeFilter days={days} eventType={eventType} />

        <section aria-labelledby="insights-traffic-heading" className="mt-8">
          <h2
            id="insights-traffic-heading"
            className="text-lg font-semibold text-stone-900"
          >
            {t('trafficHeading')}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <MetricCard
              label={t('totalViews')}
              count={totalViews}
              testId="insights-total-views"
            />
            <MetricCard label={t('busiestDay')} count={busiestDay} />
            <MetricCard
              label={t('averagePerDay')}
              count={Math.round(totalViews / days)}
            />
          </div>

          <h3 className="mt-8 text-sm font-semibold text-stone-700">
            {t('trendHeading')}
          </h3>
          {totalViews === 0 ? (
            <Card className="mt-4" description={t('trafficEmpty')} />
          ) : (
            <InsightsTrendChart days={dailySeries} />
          )}

          <h3 className="mt-8 text-sm font-semibold text-stone-700">
            {t('topPagesHeading')}
          </h3>
          {topPages.length === 0 ? (
            <Card className="mt-4" description={t('trafficEmpty')} />
          ) : (
            <InsightsTopPages pages={topPages} />
          )}
        </section>

        <section aria-labelledby="insights-security-heading" className="mt-12">
          <h2
            id="insights-security-heading"
            className="text-lg font-semibold text-stone-900"
          >
            {t('securityHeading')}
          </h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard label={t('totalEvents')} count={totalEvents} />
            {SECURITY_EVENT_TYPES.map((type) => (
              <MetricCard
                key={type}
                label={t(`eventTypes.${type}`)}
                count={eventsByType[type]}
                tone="alert"
              />
            ))}
          </div>

          <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
            <InsightsEventFilter selected={eventType} rangeDays={days} />
            {eventType ? (
              <Link
                href={href({ type: null })}
                className="rounded pb-2 text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
              >
                {t('clearTypeFilter')}
              </Link>
            ) : null}
          </div>

          {rows.length === 0 ? (
            <Card
              className="mt-6"
              description={
                eventType ? t('eventsEmptyFiltered') : t('eventsEmpty')
              }
            />
          ) : (
            <>
              <InsightsEventTable events={rows} />
              <ListPagination
                page={safePage}
                totalPages={totalPages}
                buildHref={(target) => href({ page: target })}
              />
            </>
          )}
        </section>
      </Container>
    </main>
  );
}
