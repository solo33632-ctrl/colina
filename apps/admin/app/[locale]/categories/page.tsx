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
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Categories', 'heading');
}

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function CategoriesPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Categories');
  const common = await getTranslations('Common');
  const query = ((await searchParams).q ?? '').trim();
  const isFiltered = query.length > 0;

  const categories = await prisma.machineCategory.findMany({
    where: isFiltered
      ? {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' } },
            { nameAr: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { machines: true } } },
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
        />
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
