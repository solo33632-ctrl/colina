import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { AuditChangeTable } from '@/components/audit-change-table';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListPagination } from '@/components/list-pagination';
import {
  auditEntityLabelKey,
  auditEntityType,
  auditEntrySentence,
  parseAuditDetails,
} from '@/lib/audit-log-view';
import { intlLocale, relativeTime } from '@/lib/format';
import { sectionMetadata } from '@/lib/metadata';
import { requirePermission } from '@/lib/permissions';
import {
  resolveActivityEntities,
  USER_ACTIVITY_PAGE_SIZE,
} from '@/lib/user-activity';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Users', 'activity.heading');
}

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string }>;
};

export default async function UserActivityPage({
  params,
  searchParams,
}: Props) {
  const session = await requirePermission('users:manage');
  if (!session) {
    const t = await getTranslations('Users');
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

  const { id } = await params;
  const { page: pageParam } = await searchParams;
  const locale = await getLocale();
  const t = await getTranslations('Users');
  const audit = await getTranslations('AuditLog');
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');

  const account = await prisma.adminUser.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          auditLogs: true,
          createdMachines: true,
          createdMachineCategories: true,
        },
      },
    },
  });
  if (!account) {
    notFound();
  }

  const parsedPage = Number.parseInt(pageParam ?? '', 10);
  const page = Number.isInteger(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const total = account._count.auditLogs;
  const totalPages = Math.max(1, Math.ceil(total / USER_ACTIVITY_PAGE_SIZE));
  const safePage = Math.min(page, totalPages);

  const entries = await prisma.auditLog.findMany({
    where: { adminUserId: account.id },
    orderBy: { createdAt: 'desc' },
    skip: (safePage - 1) * USER_ACTIVITY_PAGE_SIZE,
    take: USER_ACTIVITY_PAGE_SIZE,
  });

  const entityLinks = await resolveActivityEntities(
    entries.map((entry) => entry.entity)
  );

  const intl = intlLocale(locale);
  const fullDate = (date: Date) =>
    date.toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' });

  const entityLabel = (entity: string) => {
    const key = auditEntityLabelKey(entity);
    return key && audit.has(key as never)
      ? audit(key as never)
      : auditEntityType(entity);
  };

  const buildHref = (targetPage: number) =>
    targetPage > 1
      ? `/users/${account.id}?page=${targetPage}`
      : `/users/${account.id}`;

  const infoRow = (label: string, value: ReactNode) => (
    <div className="min-w-0">
      <dt className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </dt>
      <dd className="mt-0.5 break-words text-sm text-stone-900">{value}</dd>
    </div>
  );

  return (
    <main>
      <Container className="py-10">
        <Breadcrumbs
          sectionHref="/users"
          sectionLabel={nav('users')}
          current={t('activity.heading')}
        />

        <Card title={t('activity.accountInfo')} className="mt-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {infoRow(t('activity.name'), account.name ?? common('none'))}
            {infoRow(
              t('activity.email'),
              <span dir="ltr">{account.email}</span>
            )}
            {infoRow(
              t('activity.role'),
              account.role === 'SUPER_ADMIN'
                ? t('roles.admin')
                : t('roles.editor')
            )}
            {infoRow(t('activity.created'), fullDate(account.createdAt))}
            {infoRow(t('activity.actionsCount'), total)}
            {infoRow(
              t('activity.machinesCount'),
              account._count.createdMachines
            )}
            {infoRow(
              t('activity.categoriesCount'),
              account._count.createdMachineCategories
            )}
          </dl>
        </Card>

        <h2 className="mt-10 text-lg font-semibold text-stone-900">
          {t('activity.actionsHeading')}
        </h2>

        {entries.length === 0 ? (
          <ListEmptyState message={t('activity.empty')} />
        ) : (
          <>
            <ul className="mt-4 grid gap-4">
              {entries.map((entry) => {
                const details = parseAuditDetails(entry.details);
                const sentence = auditEntrySentence(
                  entry.action,
                  entry.details,
                  locale
                );
                const link = entityLinks.get(entry.entity) ?? {
                  kind: 'unlinked' as const,
                };
                const relative = relativeTime(entry.createdAt, locale);
                const fullTime = fullDate(entry.createdAt);

                return (
                  <li key={entry.id} data-testid="user-activity-entry">
                    <Card>
                      <div className="flex flex-wrap items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-base font-semibold text-stone-900">
                            {sentence ? (
                              sentence.name ? (
                                audit(
                                  `actions.${sentence.key}` as never,
                                  { name: sentence.name } as never
                                )
                              ) : (
                                audit(`actions.${sentence.key}` as never)
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
                            <time
                              dateTime={entry.createdAt.toISOString()}
                              title={fullTime}
                            >
                              {relative ?? audit('justNow')}
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

                      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
                        {link.kind === 'linked' ? (
                          <Link
                            href={link.href}
                            className="rounded font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                          >
                            {t('activity.viewEntity')}
                          </Link>
                        ) : link.kind === 'missing' ? (
                          <span className="text-stone-500">
                            {t('activity.deletedEntity')}
                          </span>
                        ) : null}
                      </div>

                      {details && details.changes.length > 0 ? (
                        <details className="group mt-4">
                          <summary className="cursor-pointer list-none rounded text-sm font-medium text-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 [&::-webkit-details-marker]:hidden">
                            <span
                              aria-hidden="true"
                              className="me-1 inline-block transition-transform group-open:rotate-90"
                            >
                              ▸
                            </span>
                            {t('activity.changes')}
                          </summary>
                          <AuditChangeTable changes={details.changes} />
                        </details>
                      ) : (
                        <p className="mt-3 text-sm text-stone-500">
                          {t('activity.noDetails')}
                        </p>
                      )}
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
