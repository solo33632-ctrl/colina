import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { AdminThumb } from '@/components/admin-thumb';
import { DeleteButton } from '@/components/delete-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { ListPagination } from '@/components/list-pagination';
import { deleteNews } from '@/lib/actions/news';
import { intlLocale } from '@/lib/format';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'News', 'heading');
}

// A news archive accumulates: every campaign adds posts, so unlike the
// structural lists this one is paginated too.
const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ q?: string; page?: string }>;
};

export default async function NewsPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('News');
  const common = await getTranslations('Common');
  const { q, page: pageParam } = await searchParams;
  const query = (q ?? '').trim();
  const isFiltered = query.length > 0;

  const where = isFiltered
    ? {
        OR: [
          { titleEn: { contains: query, mode: 'insensitive' as const } },
          { titleAr: { contains: query, mode: 'insensitive' as const } },
        ],
      }
    : undefined;

  const total = await prisma.newsPost.count({ where });
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const parsed = Number.parseInt(pageParam ?? '', 10);
  const requested = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
  const page = Math.min(requested, totalPages);

  const posts = await prisma.newsPost.findMany({
    where,
    orderBy: { publishedAt: 'desc' },
    take: PAGE_SIZE,
    skip: (page - 1) * PAGE_SIZE,
  });
  type PostRow = (typeof posts)[number];

  const title = (row: PostRow) =>
    locale === 'ar' ? row.titleAr || row.titleEn : row.titleEn || row.titleAr;

  const columns: AdminTableColumn<PostRow>[] = [
    {
      key: 'thumbnail',
      header: common('thumbnail'),
      className: 'w-14',
      render: (row) => <AdminThumb src={row.image} name={title(row)} />,
    },
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <span
          title={title(row)}
          className="block max-w-[18rem] truncate font-medium text-stone-900"
        >
          {title(row)}
        </span>
      ),
    },
    {
      key: 'publishedAt',
      header: t('form.publishedAt'),
      className: 'hidden md:table-cell text-stone-600',
      render: (row) => row.publishedAt.toLocaleDateString(intlLocale(locale)),
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/news/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteButton
            compact
            label={t('delete.button')}
            confirmMessage={t('delete.confirm')}
            redirectTo="/news"
            onDelete={deleteNews.bind(null, row.id)}
          />
        </div>
      ),
    },
  ];

  const pageHref = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('page', String(target));
    return `/news?${params.toString()}`;
  };

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/news/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && posts.length > 0}
          clearHref="/news"
        />
        {posts.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/news' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/news/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <>
            <AdminTable
              label={t('heading')}
              columns={columns}
              rows={posts}
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
