import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { AdminThumb } from '@/components/admin-thumb';
import { DeleteCategoryButton } from '@/components/delete-category-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import {
  EditorOriginBadge,
  PublishStatusBadge,
} from '@/components/publish-status-badge';
import { SaveBanner } from '@/components/save-banner';
import { sectionMetadata } from '@/lib/metadata';
import { guardPage } from '@/lib/page-guard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Categories', 'heading');
}

// Stage 4e: the one extra list filter — an unpublished row created by an
// EDITOR, exactly as the brief defines "Awaiting review".
const AWAITING_REVIEW = 'awaiting-review';

type Props = {
  searchParams: Promise<{ q?: string; status?: string; saved?: string }>;
};

export default async function CategoriesPage({ searchParams }: Props) {
  const session = await guardPage('categories:write');
  const locale = await getLocale();
  const t = await getTranslations('Categories');
  const common = await getTranslations('Common');
  const { q, status: statusParam, saved } = await searchParams;
  const query = (q ?? '').trim();
  const awaitingReview = statusParam === AWAITING_REVIEW;
  const isFiltered = query.length > 0 || awaitingReview;

  const categories = await prisma.machineCategory.findMany({
    where: {
      // Stage 4a: editors see only the categories they created, filtered in
      // the database query (never after loading the full list).
      ...(session.user.role === 'EDITOR'
        ? { createdById: session.user.id }
        : {}),
      // Stage 4e: draft-only rows from editors, filtered in SQL.
      ...(awaitingReview
        ? { isPublished: false, createdBy: { role: 'EDITOR' as const } }
        : {}),
      ...(isFiltered && query.length > 0
        ? {
            OR: [
              { nameEn: { contains: query, mode: 'insensitive' as const } },
              { nameAr: { contains: query, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: 'asc' },
    include: {
      _count: { select: { machines: true } },
      createdBy: { select: { role: true } },
    },
  });
  type CategoryRow = (typeof categories)[number];

  const name = (row: CategoryRow) =>
    locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr;

  const columns: AdminTableColumn<CategoryRow>[] = [
    {
      key: 'thumbnail',
      header: common('thumbnail'),
      className: 'w-14',
      render: (row) => <AdminThumb src={row.image} name={name(row)} />,
    },
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <span
          title={name(row)}
          className="block max-w-[18rem] truncate font-medium text-stone-900"
        >
          {name(row)}
        </span>
      ),
    },
    {
      key: 'machines',
      header: t('heading'),
      className: 'hidden md:table-cell text-stone-600',
      render: (row) => t('machineCount', { count: row._count.machines }),
    },
    {
      key: 'status',
      header: t('list.status'),
      className: 'whitespace-nowrap',
      render: (row) => (
        <div className="flex flex-wrap items-center gap-1.5">
          <PublishStatusBadge published={row.isPublished}>
            {row.isPublished ? common('published') : common('draft')}
          </PublishStatusBadge>
          {row.createdBy?.role === 'EDITOR' ? (
            <EditorOriginBadge>{common('createdByEditor')}</EditorOriginBadge>
          ) : null}
        </div>
      ),
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/categories/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteCategoryButton
            categoryId={row.id}
            machineCount={row._count.machines}
            itemName={name(row)}
            compact
          />
        </div>
      ),
    },
  ];

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/categories/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && categories.length > 0}
          clearHref="/categories"
        >
          <div>
            <label
              htmlFor="category-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByStatus')}
            </label>
            <select
              id="category-status-filter"
              name="status"
              defaultValue={awaitingReview ? AWAITING_REVIEW : ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{common('all')}</option>
              <option value={AWAITING_REVIEW}>
                {t('list.awaitingReview')}
              </option>
            </select>
          </div>
        </ListFilters>
        {saved ? <SaveBanner message={common('saved')} /> : null}
        {categories.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/categories' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/categories/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={categories}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
