import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import {
  LeadBadge,
  leadKindTone,
  leadStatusTone,
} from '@/components/lead-badges';
import { LeadBulkBar } from '@/components/lead-bulk-bar';
import {
  LeadRowCheckbox,
  LeadSelectAll,
} from '@/components/lead-select-checkbox';
import { LeadSelectionProvider } from '@/components/lead-selection';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
import { SaveBanner } from '@/components/save-banner';
import { inputClasses } from '@/components/form-fields';
import { intlLocale, relativeTime } from '@/lib/format';
import { LEAD_STATUSES, type LeadStatus } from '@/lib/lead-status';
import { queryLeads } from '@/lib/leads';
import {
  hasActiveLeadFilters,
  LEAD_TYPES,
  leadListHref,
  parseLeadListFilters,
  type LeadListRow,
  type LeadType,
} from '@/lib/leads-query';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Leads', 'heading');
}

type Props = {
  searchParams: Promise<{
    type?: string;
    status?: string;
    q?: string;
    from?: string;
    to?: string;
    page?: string;
    /** `?deleted=N`: how many rows the last delete call removed. */
    deleted?: string;
  }>;
};

export default async function LeadsPage({ searchParams }: Props) {
  const params = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('Leads');
  const common = await getTranslations('Common');
  const filters = parseLeadListFilters(params);
  const result = await queryLeads(filters);
  const intl = intlLocale(locale);
  const filtered = hasActiveLeadFilters(filters);

  // The delete paths (single and bulk) land here with `?deleted=N`: the count
  // they removed, `0` meaning every requested id was already gone. Anything
  // else in the parameter is ignored rather than guessed.
  const deletedParam = Number.parseInt(params.deleted ?? '', 10);
  const deleted =
    params.deleted !== undefined &&
    Number.isInteger(deletedParam) &&
    deletedParam >= 0
      ? deletedParam
      : null;
  const deletedMessage =
    deleted === null
      ? null
      : deleted === 0
        ? t('delete.noneDeleted')
        : t('delete.deletedCount', { count: deleted });

  // Kept filter- and page-aware, so a deletion inside a filtered view lands
  // back in the same view. The previous page is for the emptied-page case: the
  // bulk bar decides which of the two it needs after seeing the real counts.
  const successHref = leadListHref(filters, { page: result.page });
  const previousPageHref = leadListHref(filters, {
    page: Math.max(1, result.page - 1),
  });

  const tabLabels: Record<LeadType, string> = {
    all: t('tabs.all'),
    contact: t('tabs.contact'),
    maintenance: t('tabs.maintenance'),
    quote: t('tabs.quote'),
  };

  const statusLabel = (status: LeadStatus) => t(`statuses.${status}`);
  const detailHref = (row: LeadListRow) => `/leads/${row.detailKind}/${row.id}`;
  const fullDate = (date: Date) =>
    date.toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' });
  const received = (date: Date) => relativeTime(date, locale) ?? t('justNow');

  const contactLinks = (row: LeadListRow) => (
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

  const columns: AdminTableColumn<LeadListRow>[] = [
    {
      key: 'select',
      header: <LeadSelectAll label={t('delete.selectAll')} />,
      className: 'w-12',
      render: (row) => (
        <LeadRowCheckbox
          target={{ kind: row.detailKind, id: row.id }}
          label={t('delete.selectRow', { name: row.name })}
        />
      ),
    },
    {
      key: 'type',
      header: t('table.type'),
      className: 'w-28',
      render: (row) => (
        <LeadBadge tone={leadKindTone(row.kind)}>
          {t(`kinds.${row.kind}`)}
        </LeadBadge>
      ),
    },
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <div className="min-w-0">
          <Link
            href={detailHref(row)}
            title={row.name}
            className="block max-w-[15rem] truncate rounded font-medium text-stone-900 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {row.name}
          </Link>
          {row.company ? (
            <p
              title={row.company}
              className="mt-0.5 block max-w-[15rem] truncate text-xs text-stone-500"
            >
              {row.company}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'contact',
      header: t('table.contact'),
      className: 'hidden lg:table-cell',
      render: (row) => contactLinks(row),
    },
    {
      key: 'machine',
      header: t('table.machine'),
      className: 'hidden xl:table-cell',
      render: (row) => (
        <span
          title={row.machine ?? row.subject}
          className="block max-w-[16rem] truncate text-sm text-stone-700"
        >
          {(row.machine ?? row.subject) || common('none')}
        </span>
      ),
    },
    {
      key: 'status',
      header: t('table.status'),
      render: (row) => (
        <LeadBadge tone={leadStatusTone(row.status)}>
          {statusLabel(row.status)}
        </LeadBadge>
      ),
    },
    {
      key: 'received',
      header: t('table.received'),
      className: 'whitespace-nowrap',
      render: (row) => (
        <time
          dateTime={row.createdAt.toISOString()}
          title={fullDate(row.createdAt)}
          className="text-sm text-stone-600"
        >
          {received(row.createdAt)}
        </time>
      ),
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <Link
          href={detailHref(row)}
          className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {common('view')}
        </Link>
      ),
    },
  ];

  return (
    <main>
      <Container
        className={result.rows.length > 0 ? 'pt-10 pb-28' : 'py-10'}
      >
        {deletedMessage ? (
          <SaveBanner param="deleted" message={deletedMessage} />
        ) : null}
        <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <p className="text-sm text-stone-500">
            {t('totalCount', { count: result.counts.all })}
          </p>
        </div>

        {/* Type tabs: real links, so a filtered inbox stays shareable. */}
        <nav
          aria-label={t('filterByType')}
          className="mt-5 flex flex-wrap gap-2"
        >
          {LEAD_TYPES.map((type) => {
            const active = filters.type === type;
            return (
              <Link
                key={type}
                href={leadListHref(filters, { type, page: 1 })}
                aria-current={active ? 'page' : undefined}
                className={[
                  'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                  active
                    ? 'border-brand-700 bg-brand-700 text-white'
                    : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-50',
                ].join(' ')}
              >
                <span>{tabLabels[type]}</span>
                <span className={active ? 'text-brand-100' : 'text-stone-400'}>
                  {result.counts[type]}
                </span>
              </Link>
            );
          })}
        </nav>

        <ListFilters
          query={filters.query}
          filtered={filtered && result.rows.length > 0}
          clearHref="/leads"
          label={t('searchLabel')}
          placeholder={t('searchPlaceholder')}
          clearLabel={t('clearFilters')}
        >
          {filters.type !== 'all' ? (
            <input type="hidden" name="type" value={filters.type} />
          ) : null}
          <div>
            <label
              htmlFor="lead-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByStatus')}
            </label>
            <select
              id="lead-status-filter"
              name="status"
              defaultValue={filters.status ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{common('all')}</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <div className="w-[10.5rem]">
            <label
              htmlFor="lead-from-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('from')}
            </label>
            <input
              id="lead-from-filter"
              name="from"
              type="date"
              defaultValue={filters.from ?? ''}
              className={inputClasses}
            />
          </div>
          <div className="w-[10.5rem]">
            <label
              htmlFor="lead-to-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('to')}
            </label>
            <input
              id="lead-to-filter"
              name="to"
              type="date"
              defaultValue={filters.to ?? ''}
              className={inputClasses}
            />
          </div>
        </ListFilters>

        {result.rows.length === 0 ? (
          <ListEmptyState
            message={filtered ? t('noResults') : t('empty')}
            clearHref={filtered ? '/leads' : undefined}
            clearLabel={filtered ? t('clearFilters') : undefined}
          />
        ) : (
          <LeadSelectionProvider
            pageItems={result.rows.map((row) => ({
              kind: row.detailKind,
              id: row.id,
            }))}
          >
            {/* Select-all toolbar for the card layout, where the table's
                header checkbox is hidden with the rest of the table. */}
            <div className="mt-6 flex items-center justify-between md:hidden">
              <LeadSelectAll label={t('delete.selectAll')} showLabel />
            </div>

            {/* Phones get cards: seven table columns cannot stay readable at
                390px, and the row link is still the same detail route. */}
            <ul aria-label={t('heading')} className="mt-3 grid gap-3 md:hidden">
              {result.rows.map((row) => (
                <li key={`${row.kind}-${row.id}`}>
                  <Card className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <LeadRowCheckbox
                        target={{ kind: row.detailKind, id: row.id }}
                        label={t('delete.selectRow', { name: row.name })}
                      />
                      <LeadBadge tone={leadKindTone(row.kind)}>
                        {t(`kinds.${row.kind}`)}
                      </LeadBadge>
                      <LeadBadge tone={leadStatusTone(row.status)}>
                        {statusLabel(row.status)}
                      </LeadBadge>
                      <time
                        dateTime={row.createdAt.toISOString()}
                        title={fullDate(row.createdAt)}
                        className="ms-auto text-xs text-stone-500"
                      >
                        {received(row.createdAt)}
                      </time>
                    </div>
                    <Link
                      href={detailHref(row)}
                      className="mt-3 block break-words rounded text-base font-semibold text-stone-900 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {row.name}
                    </Link>
                    {row.company ? (
                      <p className="mt-0.5 break-words text-sm text-stone-500">
                        {row.company}
                      </p>
                    ) : null}
                    <div className="mt-3">{contactLinks(row)}</div>
                    <p className="mt-3 break-words text-sm text-stone-600">
                      <span className="font-medium text-stone-700">
                        {t('table.machine')}:
                      </span>{' '}
                      {(row.machine ?? row.subject) || common('none')}
                    </p>
                    <div className="mt-3 flex justify-end">
                      <Link
                        href={detailHref(row)}
                        className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        {common('view')}
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>

            <div className="hidden md:block">
              <AdminTable
                label={t('heading')}
                columns={columns}
                rows={result.rows}
                rowKey={(row) => `${row.kind}-${row.id}`}
              />
            </div>

            <ListPagination
              page={result.page}
              totalPages={result.totalPages}
              buildHref={(page) => leadListHref(filters, { page })}
            />

            <LeadBulkBar
              successHref={successHref}
              previousPageHref={previousPageHref}
              pageCount={result.rows.length}
            />
          </LeadSelectionProvider>
        )}
      </Container>
    </main>
  );
}
