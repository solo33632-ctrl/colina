import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { inputClasses } from '@/components/form-fields';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
import { requireSuperAdmin } from '@/lib/admin-action';
import type {
  AuditChange,
  AuditFieldType,
  AuditTextValue,
} from '@/lib/audit-changes';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_SENTENCES,
  AUDIT_DELETED_ADMIN_FILTER,
  AUDIT_ENTITY_MESSAGE_KEYS,
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE_SIZE,
  auditEntityType,
  parseAuditDate,
  parseAuditDetails,
} from '@/lib/audit-log-view';
import { intlLocale, relativeTime } from '@/lib/format';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'AuditLog', 'heading');
}

type Props = {
  searchParams: Promise<{
    q?: string;
    entity?: string;
    action?: string;
    admin?: string;
    from?: string;
    to?: string;
    page?: string;
  }>;
};

function isTextValue(value: unknown): value is AuditTextValue {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { preview?: unknown }).preview === 'string' &&
    typeof (value as { length?: unknown }).length === 'number' &&
    typeof (value as { truncated?: unknown }).truncated === 'boolean'
  );
}

/** Images read as their file name: a full Cloudinary URL is noise in a table. */
function imageShortText(url: string): string | null {
  try {
    const name = decodeURIComponent(
      new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    );
    if (name === '') {
      return null;
    }
    return name.length > 60 ? `${name.slice(0, 59)}…` : name;
  } catch {
    return null;
  }
}

export default async function AuditLogPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('AuditLog');
  const common = await getTranslations('Common');

  // First role gate in the project: editors get an explanatory page,
  // not a bare 403 (proxy.ts only checks for a session, not the role).
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
  const query = (params.q ?? '').trim();
  const entityFilter = (AUDIT_ENTITY_TYPES as readonly string[]).includes(
    params.entity ?? ''
  )
    ? params.entity!
    : '';
  const actionFilter = (AUDIT_ACTIONS as readonly string[]).includes(
    params.action ?? ''
  )
    ? params.action!
    : '';
  const adminFilter = (params.admin ?? '').trim();
  const fromDate = parseAuditDate(params.from, 'start');
  const toDate = parseAuditDate(params.to, 'end');
  const fromInput = fromDate ? params.from! : '';
  const toInput = toDate ? params.to! : '';

  const parsedPage = Number.parseInt(params.page ?? '', 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const isFiltered = Boolean(
    query || entityFilter || actionFilter || adminFilter || fromInput || toInput
  );

  const where = {
    ...(entityFilter
      ? {
          entity: {
            startsWith: entityFilter === 'Lead' ? 'Lead ' : `${entityFilter}:`,
          },
        }
      : {}),
    ...(actionFilter ? { action: actionFilter } : {}),
    ...(adminFilter === AUDIT_DELETED_ADMIN_FILTER
      ? { adminUserId: null }
      : adminFilter
        ? { adminUserId: adminFilter }
        : {}),
    ...(fromDate || toDate
      ? {
          createdAt: {
            ...(fromDate ? { gte: fromDate } : {}),
            ...(toDate ? { lte: toDate } : {}),
          },
        }
      : {}),
    ...(query
      ? {
          OR: [
            // New rows carry the lower-cased label text. JSON path filters
            // have no `mode`, which is why the writer lower-cases it.
            {
              details: {
                path: ['search'],
                string_contains: query.toLowerCase(),
              },
            },
            // Old rows and the unwired entities have no search text, so the
            // raw entity/action stay searchable too.
            { entity: { contains: query, mode: 'insensitive' as const } },
            { action: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const total = await prisma.auditLog.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const [entries, admins] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (safePage - 1) * AUDIT_PAGE_SIZE,
      take: AUDIT_PAGE_SIZE,
      include: { adminUser: { select: { email: true } } },
    }),
    prisma.adminUser.findMany({
      orderBy: { email: 'asc' },
      select: { id: true, email: true },
    }),
  ]);

  const buildHref = (targetPage: number) => {
    const next = new URLSearchParams();
    if (query) next.set('q', query);
    if (entityFilter) next.set('entity', entityFilter);
    if (actionFilter) next.set('action', actionFilter);
    if (adminFilter) next.set('admin', adminFilter);
    if (fromInput) next.set('from', fromInput);
    if (toInput) next.set('to', toInput);
    if (targetPage > 1) next.set('page', String(targetPage));
    const search = next.toString();
    return search ? `/audit-log?${search}` : '/audit-log';
  };

  const entityLabel = (entityType: string) => {
    const key = AUDIT_ENTITY_MESSAGE_KEYS[entityType];
    return key && t.has(`entities.${key}` as never)
      ? t(`entities.${key}` as never)
      : entityType;
  };

  const actionOptionLabel = (action: string) => {
    const key = AUDIT_ACTION_SENTENCES[action];
    if (!key) {
      return action;
    }
    // The raw template keeps `{name}`; the filter names the kind of action,
    // not one record, so the placeholder is removed rather than formatted.
    return String(t.raw(`actions.${key}` as never))
      .replace(/\s*\{name\}\s*/g, '')
      .trim();
  };

  const fieldLabel = (labelKey: string) => {
    const key = `fields.${labelKey}`;
    return t.has(key as never) ? t(key as never) : labelKey;
  };

  const renderValue = (
    type: AuditFieldType,
    value: AuditChange['from']
  ): ReactNode => {
    if (value === null || value === undefined) {
      return t('emptyValue');
    }

    switch (type) {
      case 'boolean':
        return value === true
          ? t('yes')
          : value === false
            ? t('no')
            : t('emptyValue');
      case 'number':
        return typeof value === 'number'
          ? value.toLocaleString(intlLocale(locale))
          : t('emptyValue');
      case 'date': {
        if (typeof value !== 'string') {
          return t('emptyValue');
        }
        const date = new Date(value);
        return Number.isNaN(date.getTime())
          ? t('emptyValue')
          : date.toLocaleString(intlLocale(locale));
      }
      case 'longText': {
        if (!isTextValue(value)) {
          return t('emptyValue');
        }
        return (
          <span className="whitespace-pre-wrap break-words">
            {value.preview}
            {value.truncated ? (
              <span className="mt-1 block text-xs text-stone-500">
                {t('fullLength', { length: value.length })}
              </span>
            ) : null}
          </span>
        );
      }
      case 'imageUrl': {
        if (typeof value !== 'string') {
          return t('emptyValue');
        }
        return imageShortText(value) ?? t('imageValue');
      }
      case 'list':
        return typeof value === 'number'
          ? t('itemCount', { count: value })
          : t('emptyValue');
      case 'url':
      case 'text':
      default:
        return typeof value === 'string' && value !== ''
          ? value
          : t('emptyValue');
    }
  };

  const renderChanges = (changes: AuditChange[]) => (
    <>
      {/* Desktop table. */}
      <div className="mt-3 hidden md:block">
        <table className="w-full table-fixed border-collapse text-sm">
          <thead>
            <tr className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500">
              <th
                scope="col"
                className="w-1/4 py-2 pe-3 text-start font-medium"
              >
                {t('field')}
              </th>
              <th
                scope="col"
                className="w-[37.5%] py-2 pe-3 text-start font-medium"
              >
                {t('before')}
              </th>
              <th scope="col" className="w-[37.5%] py-2 text-start font-medium">
                {t('after')}
              </th>
            </tr>
          </thead>
          <tbody>
            {changes.map((change, index) => (
              <tr
                key={`${change.field}-${index}`}
                className="border-b border-stone-100 align-top"
              >
                <th
                  scope="row"
                  className="break-words py-2 pe-3 text-start font-medium text-stone-700"
                >
                  {fieldLabel(change.labelKey)}
                </th>
                <td className="break-words py-2 pe-3 text-stone-700">
                  {renderValue(change.type, change.from)}
                </td>
                <td className="break-words py-2 text-stone-900">
                  {renderValue(change.type, change.to)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Cards on narrow screens: the same three values, stacked. */}
      <ul className="mt-3 grid gap-3 md:hidden">
        {changes.map((change, index) => (
          <li
            key={`${change.field}-${index}`}
            className="min-w-0 rounded-lg border border-stone-200 bg-stone-50 p-3"
          >
            <p className="break-words text-sm font-semibold text-stone-900">
              {fieldLabel(change.labelKey)}
            </p>
            <dl className="mt-2 grid gap-2 text-sm">
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {t('before')}
                </dt>
                <dd className="mt-0.5 break-words text-stone-700">
                  {renderValue(change.type, change.from)}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
                  {t('after')}
                </dt>
                <dd className="mt-0.5 break-words text-stone-900">
                  {renderValue(change.type, change.to)}
                </dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </>
  );

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
        <p className="mt-2 text-sm text-stone-600">{t('intro')}</p>

        <ListFilters
          query={query}
          filtered={isFiltered && entries.length > 0}
          clearHref="/audit-log"
          label={t('filters.search')}
          placeholder={t('filters.searchPlaceholder')}
          clearLabel={t('filters.clear')}
        >
          <div className="min-w-[9rem] flex-1 sm:max-w-[13rem]">
            <label
              htmlFor="audit-entity-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('filters.entity')}
            </label>
            <select
              id="audit-entity-filter"
              name="entity"
              defaultValue={entityFilter}
              className={inputClasses}
            >
              <option value="">{t('filters.allEntities')}</option>
              {AUDIT_ENTITY_TYPES.map((entityType) => (
                <option key={entityType} value={entityType}>
                  {entityLabel(entityType)}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[10rem] flex-1 sm:max-w-[16rem]">
            <label
              htmlFor="audit-action-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('filters.action')}
            </label>
            <select
              id="audit-action-filter"
              name="action"
              defaultValue={actionFilter}
              className={inputClasses}
            >
              <option value="">{t('filters.allActions')}</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {actionOptionLabel(action)}
                </option>
              ))}
            </select>
          </div>

          <div className="min-w-[10rem] flex-1 sm:max-w-[14rem]">
            <label
              htmlFor="audit-admin-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('filters.admin')}
            </label>
            <select
              id="audit-admin-filter"
              name="admin"
              defaultValue={adminFilter}
              className={inputClasses}
            >
              <option value="">{t('filters.allAdmins')}</option>
              <option value={AUDIT_DELETED_ADMIN_FILTER}>
                {t('deletedAdmin')}
              </option>
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.email}
                </option>
              ))}
              {adminFilter &&
              adminFilter !== AUDIT_DELETED_ADMIN_FILTER &&
              !admins.some((admin) => admin.id === adminFilter) ? (
                <option value={adminFilter}>{t('deletedAdmin')}</option>
              ) : null}
            </select>
          </div>

          <div className="min-w-[8.5rem] flex-1 sm:max-w-[11rem]">
            <label
              htmlFor="audit-from-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('filters.from')}
            </label>
            <input
              id="audit-from-filter"
              name="from"
              type="date"
              defaultValue={fromInput}
              className={inputClasses}
            />
          </div>

          <div className="min-w-[8.5rem] flex-1 sm:max-w-[11rem]">
            <label
              htmlFor="audit-to-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {t('filters.to')}
            </label>
            <input
              id="audit-to-filter"
              name="to"
              type="date"
              defaultValue={toInput}
              className={inputClasses}
            />
          </div>
        </ListFilters>

        {entries.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? t('noResults') : t('empty')}
            clearHref={isFiltered ? '/audit-log' : undefined}
            clearLabel={isFiltered ? t('filters.clear') : undefined}
          />
        ) : (
          <>
            <ul className="mt-6 grid gap-4">
              {entries.map((entry) => {
                const details = parseAuditDetails(entry.details);
                const sentenceKey = AUDIT_ACTION_SENTENCES[entry.action];
                const label = details?.label
                  ? locale === 'ar'
                    ? (details.label.ar ?? details.label.en)
                    : (details.label.en ?? details.label.ar)
                  : null;
                const relative = relativeTime(entry.createdAt, locale);
                const fullTime = entry.createdAt.toLocaleString(
                  intlLocale(locale)
                );

                return (
                  <li key={entry.id} data-testid="audit-entry">
                    <Card>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-base font-semibold text-stone-900">
                            {sentenceKey && label ? (
                              t(
                                `actions.${sentenceKey}` as never,
                                {
                                  name: label,
                                } as never
                              )
                            ) : (
                              <span className="font-mono text-sm">
                                {entry.action}{' '}
                                <span className="font-sans text-stone-500">
                                  {entry.entity}
                                </span>
                              </span>
                            )}
                          </p>
                          <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-stone-500">
                            <span className="break-all">
                              {entry.adminUser?.email ?? t('deletedAdmin')}
                            </span>
                            <span aria-hidden="true">
                              {common('separator')}
                            </span>
                            <time
                              dateTime={entry.createdAt.toISOString()}
                              title={fullTime}
                            >
                              {relative ?? t('justNow')}
                            </time>
                            <span aria-hidden="true">
                              {common('separator')}
                            </span>
                            <span>{fullTime}</span>
                          </p>
                        </div>
                        <span className="inline-flex whitespace-nowrap rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
                          {entityLabel(auditEntityType(entry.entity))}
                        </span>
                      </div>

                      <details
                        className="group mt-4"
                        data-testid="audit-details"
                      >
                        <summary className="cursor-pointer list-none rounded text-sm font-medium text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                          <span
                            aria-hidden="true"
                            className="me-1 inline-block transition-transform group-open:rotate-90"
                          >
                            ▸
                          </span>
                          {details
                            ? t('changesSummary', {
                                count: details.changes.length,
                              })
                            : t('detailsSummary')}
                        </summary>

                        {!details ? (
                          <p className="mt-2 text-sm text-stone-600">
                            {t('noDetails')}
                          </p>
                        ) : details.changes.length === 0 ? (
                          <p className="mt-2 text-sm text-stone-600">
                            {t('noChanges')}
                          </p>
                        ) : (
                          renderChanges(details.changes)
                        )}
                      </details>
                    </Card>
                  </li>
                );
              })}
            </ul>

            <ListPagination
              page={safePage}
              totalPages={totalPages}
              buildHref={buildHref}
            />
          </>
        )}
      </Container>
    </main>
  );
}
