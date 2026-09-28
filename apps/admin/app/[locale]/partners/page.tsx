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
import { deletePartner } from '@/lib/actions/partners';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Partners', 'heading');
}

type Props = {
  searchParams: Promise<{ q?: string; saved?: string }>;
};

export default async function PartnersPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Partners');
  const common = await getTranslations('Common');
  const { q, saved } = await searchParams;
  const query = (q ?? '').trim();
  const isFiltered = query.length > 0;

  const partners = await prisma.partner.findMany({
    where: isFiltered
      ? {
          OR: [
            { nameEn: { contains: query, mode: 'insensitive' } },
            { nameAr: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'asc' },
  });
  type PartnerRow = (typeof partners)[number];

  const name = (row: PartnerRow) =>
    locale === 'ar' ? row.nameAr || row.nameEn : row.nameEn || row.nameAr;

  const columns: AdminTableColumn<PartnerRow>[] = [
    {
      key: 'thumbnail',
      header: common('thumbnail'),
      className: 'w-14',
      render: (row) => <AdminThumb src={row.logo} name={name(row)} />,
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
            href={`/partners/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteButton
            compact
            itemName={name(row)}
            redirectTo="/partners"
            onDelete={deletePartner.bind(null, row.id)}
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
            href={await getPathname({ locale, href: '/partners/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && partners.length > 0}
          clearHref="/partners"
        />
        {saved ? <SaveBanner message={common('saved')} /> : null}
        {partners.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/partners' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/partners/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={partners}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
