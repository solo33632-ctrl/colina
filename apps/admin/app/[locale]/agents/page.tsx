import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { AdminThumb } from '@/components/admin-thumb';
import { AgentPublishButton } from '@/components/agent-publish-button';
import { AgentStatusBadge } from '@/components/agent-status-badge';
import { DeleteButton } from '@/components/delete-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
import { SaveBanner } from '@/components/save-banner';
import { intlLocale, relativeTime } from '@/lib/format';
import { deleteAgent } from '@/lib/actions/agents';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Agents', 'heading');
}

// Same bound as the machines list: agents are added while the network grows,
// so the list pages rather than assuming a screenful.
const PAGE_SIZE = 20;

// URL selectors for the isPublished switch. Anything else means "all".
const STATUS_VALUES = ['published', 'hidden'] as const;
type StatusValue = (typeof STATUS_VALUES)[number];

type Props = {
  searchParams: Promise<{
    q?: string;
    country?: string;
    status?: string;
    page?: string;
    saved?: string;
  }>;
};

export default async function AgentsPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Agents');
  const common = await getTranslations('Common');
  const {
    q,
    country: countryFilter,
    status: statusParam,
    page: pageParam,
    saved,
  } = await searchParams;

  const query = (q ?? '').trim();
  const statusFilter =
    statusParam === 'published' || statusParam === 'hidden'
      ? (statusParam as StatusValue)
      : null;
  const isFiltered =
    query.length > 0 || Boolean(countryFilter) || Boolean(statusFilter);

  // Search and the two filters combine into the same `where`, like the
  // machines list: search spans the identity AND locator fields, because an
  // operator reaches for the row they mean ("the Cairo one", "the one with
  // this phone") from either direction.
  const where = {
    ...(countryFilter ? { countryEn: countryFilter } : {}),
    ...(statusFilter ? { isPublished: statusFilter === 'published' } : {}),
    ...(query
      ? {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' as const } },
            { nameAr: { contains: query, mode: 'insensitive' as const } },
            { countryEn: { contains: query, mode: 'insensitive' as const } },
            { countryAr: { contains: query, mode: 'insensitive' as const } },
            { cityEn: { contains: query, mode: 'insensitive' as const } },
            { cityAr: { contains: query, mode: 'insensitive' as const } },
            { phone: { contains: query, mode: 'insensitive' as const } },
            { email: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [countries, total] = await Promise.all([
    // The country pairs actually in use, without collapsing two rows that
    // only differ in their other language's spelling.
    prisma.agent.findMany({
      distinct: ['countryEn', 'countryAr'],
      select: { countryEn: true, countryAr: true },
      orderBy: [{ countryEn: 'asc' }, { countryAr: 'asc' }],
    }),
    prisma.agent.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parsed = Number.parseInt(pageParam ?? '', 10);
  const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  const page = Math.min(requested, totalPages);

  const agents = await prisma.agent.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });
  type AgentRow = (typeof agents)[number];

  const name = (row: AgentRow) =>
    locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr;
  const country = (row: AgentRow) =>
    locale === 'ar'
      ? row.countryAr || row.countryEn
      : row.countryEn || row.countryAr;
  const city = (row: AgentRow) =>
    locale === 'ar' ? row.cityAr || row.cityEn : row.cityEn || row.cityAr;

  // What headlines a row: its name, or — for agents that predate the name
  // columns — its country plus a visible hint that the name is what's missing.
  const headline = (row: AgentRow) => name(row) || country(row);

  // The country is the unique text an agentless-name row still has, so it
  // names the record in confirmations.
  const itemName = (row: AgentRow) => headline(row);

  const intl = intlLocale(locale);
  const fullDate = (date: Date) =>
    date.toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' });
  const updated = (row: AgentRow) =>
    relativeTime(row.updatedAt, locale) ?? t('justNow');

  // Same link shapes the leads inbox uses: the stored display text stays as
  // typed, the href is the dialable/clickable normalization, and both links
  // pin the LTR direction so the RTL card reads them correctly.
  const contactLinks = (row: AgentRow) => (
    <div className="min-w-0 space-y-0.5">
      {row.phone ? (
        <a
          href={`tel:${row.phone.replace(/[^\d+]/g, '')}`}
          dir="ltr"
          className="block whitespace-nowrap rounded text-sm text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {row.phone}
        </a>
      ) : null}
      {row.email ? (
        <a
          href={`mailto:${row.email}`}
          dir="ltr"
          className="block break-all rounded text-sm text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {row.email}
        </a>
      ) : null}
      {!row.phone && !row.email ? (
        <span className="text-sm text-stone-400">{common('none')}</span>
      ) : null}
    </div>
  );

  const statusBadge = (row: AgentRow) => (
    <AgentStatusBadge published={row.isPublished}>
      {row.isPublished ? t('list.published') : t('list.hidden')}
    </AgentStatusBadge>
  );

  const rowActions = (row: AgentRow) => (
    <div className="flex items-center justify-end gap-3">
      <Link
        href={`/agents/${row.id}/edit`}
        className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {common('edit')}
      </Link>
      <AgentPublishButton
        agentId={row.id}
        published={row.isPublished}
        agentName={itemName(row)}
      />
      <DeleteButton
        compact
        itemName={itemName(row)}
        redirectTo="/agents"
        onDelete={deleteAgent.bind(null, row.id)}
      />
    </div>
  );

  const columns: AdminTableColumn<AgentRow>[] = [
    {
      key: 'thumbnail',
      header: common('thumbnail'),
      // Wide enough for the logo plate a `contain` thumbnail draws, so the
      // cell does not crush it back into the cropping this avoids.
      className: 'w-24',
      render: (row) => (
        <AdminThumb src={row.logoUrl} name={headline(row)} fit="contain" />
      ),
    },
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <div className="min-w-0">
          <span
            title={headline(row)}
            className="block max-w-[18rem] truncate font-medium text-stone-900"
          >
            {headline(row)}
          </span>
          {!name(row) ? (
            <p className="mt-0.5 block max-w-[18rem] truncate text-xs text-stone-500">
              {t('list.nameMissing')}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'location',
      header: t('table.location'),
      render: (row) =>
        [country(row), city(row)].filter(Boolean).join(common('separator')) ||
        common('none'),
    },
    {
      key: 'contact',
      header: t('table.contact'),
      className: 'hidden lg:table-cell',
      render: (row) => contactLinks(row),
    },
    {
      key: 'status',
      header: t('table.status'),
      render: (row) => statusBadge(row),
    },
    {
      key: 'updated',
      header: t('table.updated'),
      className: 'hidden xl:table-cell whitespace-nowrap',
      render: (row) => (
        <time
          dateTime={row.updatedAt.toISOString()}
          title={fullDate(row.updatedAt)}
          className="text-sm text-stone-600"
        >
          {updated(row)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => rowActions(row),
    },
  ];

  // Pagination keeps whatever is being filtered, so paging never drops the
  // search or a filter.
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (countryFilter) params.set('country', countryFilter);
    if (statusFilter) params.set('status', statusFilter);
    params.set('page', String(target));
    return `/agents?${params.toString()}`;
  };

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/agents/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && agents.length > 0}
          clearHref="/agents"
        >
          <div>
            <label
              htmlFor="agent-country-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('list.filterByCountry')}
            </label>
            <select
              id="agent-country-filter"
              name="country"
              defaultValue={countryFilter ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{t('list.allCountries')}</option>
              {countries.map((countryRow) => (
                <option key={countryRow.countryEn} value={countryRow.countryEn}>
                  {locale === 'ar'
                    ? countryRow.countryAr || countryRow.countryEn
                    : countryRow.countryEn || countryRow.countryAr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="agent-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByStatus')}
            </label>
            <select
              id="agent-status-filter"
              name="status"
              defaultValue={statusFilter ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{t('list.allStatuses')}</option>
              {STATUS_VALUES.map((value) => (
                <option key={value} value={value}>
                  {value === 'published'
                    ? t('list.published')
                    : t('list.hidden')}
                </option>
              ))}
            </select>
          </div>
        </ListFilters>
        {saved ? <SaveBanner message={common('saved')} /> : null}
        {agents.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/agents' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/agents/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <>
            {/* Phones get cards: seven table columns cannot stay readable
                at 390px, and the card carries the same information the table
                row does. */}
            <ul
              aria-label={t('heading')}
              className="mt-3 grid list-none gap-3 md:hidden"
            >
              {agents.map((row) => (
                <li key={row.id}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <AdminThumb
                        src={row.logoUrl}
                        name={headline(row)}
                        fit="contain"
                      />
                      {statusBadge(row)}
                      <time
                        dateTime={row.updatedAt.toISOString()}
                        title={fullDate(row.updatedAt)}
                        className="ms-auto text-xs text-stone-500"
                      >
                        {updated(row)}
                      </time>
                    </div>
                    <p className="mt-3 break-words text-base font-semibold text-stone-900">
                      {headline(row)}
                    </p>
                    {!name(row) ? (
                      <p className="mt-0.5 text-xs text-stone-500">
                        {t('list.nameMissing')}
                      </p>
                    ) : null}
                    <p className="mt-0.5 break-words text-sm text-stone-500">
                      {[country(row), city(row)]
                        .filter(Boolean)
                        .join(common('separator')) || common('none')}
                    </p>
                    <div className="mt-3">{contactLinks(row)}</div>
                    <div className="mt-3">{rowActions(row)}</div>
                  </Card>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <AdminTable
                label={t('heading')}
                columns={columns}
                rows={agents}
                rowKey={(row) => row.id}
              />
            </div>

            <ListPagination
              page={page}
              totalPages={totalPages}
              buildHref={pageHref}
            />
          </>
        )}
      </Container>
    </main>
  );
}
