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
import { SaveBanner } from '@/components/save-banner';
import { sectionMetadata } from '@/lib/metadata';

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

type Props = {
  searchParams: Promise<{
    q?: string;
    category?: string;
    page?: string;
    saved?: string;
  }>;
};

export default async function MachinesPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Machines');
  const common = await getTranslations('Common');
  const {
    q,
    category: categoryFilter,
    page: pageParam,
    saved,
  } = await searchParams;

  const query = (q ?? '').trim();
  const isFiltered = query.length > 0 || Boolean(categoryFilter);

  // Search and the category filter combine: both narrow the same `where`.
  const where = {
    ...(categoryFilter ? { categoryId: categoryFilter } : {}),
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
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
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
        <span
          title={name(row)}
          className="block max-w-[18rem] truncate font-medium text-stone-900"
        >
          {name(row)}
        </span>
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
