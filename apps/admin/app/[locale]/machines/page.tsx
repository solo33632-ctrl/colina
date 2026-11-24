import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { AdminThumb } from '@/components/admin-thumb';
import { DeleteMachineButton } from '@/components/delete-machine-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
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
  return sectionMetadata(locale, 'Machines', 'heading');
}

// The catalogue grows with every model Colina sells, so this list is
// paginated; the other five lists are bounded (see the phase notes).
const PAGE_SIZE = 20;

// Stage 4e: the one extra list filter. "Awaiting review" is exactly what the
// Stage brief defines — an unpublished row created by an EDITOR.
const AWAITING_REVIEW = 'awaiting-review';

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    status?: string;
    page?: string;
    saved?: string;
  }>;
};

export default async function MachinesPage({ searchParams }: Props) {
  const session = await guardPage('machines:write');
  const locale = await getLocale();
  const t = await getTranslations('Machines');
  const common = await getTranslations('Common');
  const {
    q,
    category: categoryFilter,
    status: statusParam,
    page: pageParam,
    saved,
  } = await searchParams;

  const query = (q ?? '').trim();
  const awaitingReview = statusParam === AWAITING_REVIEW;
  const isFiltered =
    query.length > 0 || Boolean(categoryFilter) || awaitingReview;

  // Search and the category filter combine: both narrow the same `where`.
  // Stage 4a: an editor's list is narrowed in the database to rows it created,
  // not filtered after loading. A null creator never matches an editor id.
  // Stage 4e: "Awaiting review" is an editor's drafts, filtered in SQL too.
  const where = {
    ...(session.user.role === 'EDITOR' ? { createdById: session.user.id } : {}),
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
    ...(awaitingReview
      ? { isPublished: false, createdBy: { role: 'EDITOR' as const } }
      : {}),
    ...(query
      ? {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' as const } },
            { nameAr: { contains: query, mode: 'insensitive' as const } },
          ],
        }
      : {}),
  };

  const [categories, total] = await Promise.all([
    // The filter lists categories, so it obeys the same "own rows only" rule
    // as the lists themselves. The machine form is the one place an editor may
    // see every category name (to file a machine under any of them).
    prisma.machineCategory.findMany({
      where:
        session.user.role === 'EDITOR'
          ? { createdById: session.user.id }
          : undefined,
      orderBy: { nameEn: 'asc' },
    }),
    prisma.machine.count({ where }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parsed = Number.parseInt(pageParam ?? '', 10);
  const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  const page = Math.min(requested, totalPages);

  const machines = await prisma.machine.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
    include: {
      category: { select: { nameEn: true, nameAr: true } },
      createdBy: { select: { role: true } },
      images: { select: { url: true }, take: 1, orderBy: { position: 'asc' } },
    },
  });
  type MachineRow = (typeof machines)[number];

  const name = (row: MachineRow) =>
    locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr;

  const columns: AdminTableColumn<MachineRow>[] = [
    {
      key: 'thumbnail',
      header: common('thumbnail'),
      className: 'w-14',
      render: (row) => (
        <AdminThumb src={row.images[0]?.url ?? null} name={name(row)} />
      ),
    },
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        // `min-w-0` on the name keeps it truncating: inside a flex row a
        // truncating block child would otherwise refuse to shrink and push
        // the badge out of the cell.
        <div className="flex min-w-0 items-center gap-2">
          <span
            title={name(row)}
            className="block min-w-0 max-w-[18rem] truncate font-medium text-stone-900"
          >
            {name(row)}
          </span>
        </div>
      ),
    },
    {
      key: 'category',
      header: t('form.category'),
      className: 'hidden md:table-cell',
      render: (row) =>
        locale === 'ar'
          ? row.category.nameAr || row.category.nameEn
          : row.category.nameEn || row.category.nameAr,
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
            href={`/machines/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteMachineButton
            machineId={row.id}
            itemName={name(row)}
            compact
          />
        </div>
      ),
    },
  ];

  // Pagination keeps whatever is being filtered, so paging never drops the
  // search or the category.
  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    if (categoryFilter) params.set('category', categoryFilter);
    if (awaitingReview) params.set('status', AWAITING_REVIEW);
    params.set('page', String(target));
    return `/machines?${params.toString()}`;
  };

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/machines/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && machines.length > 0}
          clearHref="/machines"
        >
          <div>
            <label
              htmlFor="machine-category-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByCategory')}
            </label>
            <select
              id="machine-category-filter"
              name="category"
              defaultValue={categoryFilter ?? ''}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="">{common('allCategories')}</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {locale === 'ar'
                    ? category.nameAr || category.nameEn
                    : category.nameEn || category.nameAr}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label
              htmlFor="machine-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByStatus')}
            </label>
            <select
              id="machine-status-filter"
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
        {machines.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/machines' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/machines/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <>
            <AdminTable
              label={t('heading')}
              columns={columns}
              rows={machines}
              rowKey={(row) => row.id}
            />
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
