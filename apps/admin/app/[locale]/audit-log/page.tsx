import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { AuditChangeTable } from '@/components/audit-change-table';
import { inputClasses } from '@/components/form-fields';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
import { requirePermission } from '@/lib/permissions';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_SENTENCES,
  AUDIT_DELETED_ACTOR_PREFIX,
  AUDIT_DELETED_ADMIN_FILTER,
  AUDIT_ENTITY_TYPES,
  AUDIT_PAGE_SIZE,
  auditEntityLabelKey,
  auditEntityType,
  auditEntrySentence,
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

export default async function AuditLogPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('AuditLog');
  const common = await getTranslations('Common');

  // First role gate in the project: editors get an explanatory page,
  // not a bare 403 (proxy.ts only checks for a session, not the role).
  const session = await requirePermission('audit:read');
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
  const deletedActorFilter = adminFilter.startsWith(AUDIT_DELETED_ACTOR_PREFIX)
    ? adminFilter.slice(AUDIT_DELETED_ACTOR_PREFIX.length)
    : '';
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
      : deletedActorFilter
        ? { adminUserId: null, actorEmail: deletedActorFilter }
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

  const [entries, admins, deletedActors] = await Promise.all([
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
    // Deleted actors survive only as snapshots. One option per distinct
    // snapshot lets the filter reach a specific former account, not just
    // "every row whose actor is gone".
    prisma.auditLog.findMany({
      where: {
        adminUserId: null,
        actorEmail: { not: null },
      },
      distinct: ['actorEmail', 'actorName'],
      select: { actorEmail: true, actorName: true },
      orderBy: { actorEmail: 'asc' },
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

  const entityLabel = (entity: string) => {
    const key = auditEntityLabelKey(entity);
    return key && t.has(key as never)
      ? t(key as never)
      : auditEntityType(entity);
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

  const deletedActorOptions = deletedActors.flatMap((actor) =>
    actor.actorEmail === null
      ? []
      : [{ email: actor.actorEmail, name: actor.actorName }]
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
              {deletedActorOptions.map((actor) => (
                <option
                  key={actor.email}
                  value={`${AUDIT_DELETED_ACTOR_PREFIX}${actor.email}`}
                >
                  {actor.name ? `${actor.name} · ${actor.email}` : actor.email}{' '}
                  — {t('deletedAccount')}
                </option>
              ))}
              {admins.map((admin) => (
                <option key={admin.id} value={admin.id}>
                  {admin.email}
                </option>
              ))}
              {adminFilter &&
              adminFilter !== AUDIT_DELETED_ADMIN_FILTER &&
              !deletedActorFilter &&
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
                const sentence = auditEntrySentence(
                  entry.action,
                  entry.details,
                  locale
                );
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
                            {sentence ? (
                              sentence.name ? (
                                t(
                                  `actions.${sentence.key}` as never,
                                  {
                                    name: sentence.name,
                                  } as never
                                )
                              ) : (
                                t(`actions.${sentence.key}` as never)
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
                            {entry.actorName ? (
                              <span className="font-medium text-stone-700">
                                {entry.actorName}
                              </span>
                            ) : null}
                            <span className="break-all">
                              {entry.actorEmail ??
                                entry.adminUser?.email ??
                                t('deletedAdmin')}
                            </span>
                            {!entry.adminUser && entry.actorEmail ? (
                              <span className="rounded-full border border-amber-300 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800">
                                {t('deletedAccount')}
                              </span>
                            ) : null}
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
                          {entityLabel(entry.entity)}
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
                          <AuditChangeTable changes={details.changes} />
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
