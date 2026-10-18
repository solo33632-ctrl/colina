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
import { SaveBanner } from '@/components/save-banner';
import { deleteShowcase } from '@/lib/actions/showcase';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'MaintenanceShowcase', 'heading');
}

type Props = {
  searchParams: Promise<{ q?: string; saved?: string }>;
};

export default async function MaintenanceShowcasePage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('MaintenanceShowcase');
  const common = await getTranslations('Common');
  const { q, saved } = await searchParams;
  const query = (q ?? '').trim();
  const isFiltered = query.length > 0;

  const showcases = await prisma.maintenanceShowcase.findMany({
    where: isFiltered
      ? {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' } },
            { nameAr: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    // Newest first, and the opposite of the Partner list. A showcase is a piece
    // of finished work an admin adds as it happens, so the row just saved has to
    // be the one at the top — an "oldest first" list would bury it under every
    // earlier job and make a save look like it did nothing.
    orderBy: { createdAt: 'desc' },
  });
  type ShowcaseRow = (typeof showcases)[number];

  const name = (row: ShowcaseRow) =>
    locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr;

  const columns: AdminTableColumn<ShowcaseRow>[] = [
    {
      key: 'before',
      header: t('form.beforeImageUrl'),
      className: 'w-20',
      // `cover`, the default: these are photographs of a machine, not logos, so
      // a square crop of each half is what makes the pair readable as one
      // before/after. Both thumbnails are the same size on purpose — a before
      // and an after at different scales stop reading as the same machine.
      render: (row) => <AdminThumb src={row.beforeImageUrl} name={name(row)} />,
    },
    {
      key: 'after',
      header: t('form.afterImageUrl'),
      className: 'w-20',
      render: (row) => <AdminThumb src={row.afterImageUrl} name={name(row)} />,
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
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/maintenance-showcase/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteButton
            compact
            itemName={name(row)}
            redirectTo="/maintenance-showcase"
            onDelete={deleteShowcase.bind(null, row.id)}
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
            href={await getPathname({
              locale,
              href: '/maintenance-showcase/new',
            })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && showcases.length > 0}
          clearHref="/maintenance-showcase"
        />
        {saved ? <SaveBanner message={common('saved')} /> : null}
        {showcases.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/maintenance-showcase' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({
                    locale,
                    href: '/maintenance-showcase/new',
                  })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={showcases}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
