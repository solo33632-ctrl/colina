import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { DeleteButton } from '@/components/delete-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { deleteService } from '@/lib/actions/services';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Services', 'heading');
}

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function ServicesPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Services');
  const common = await getTranslations('Common');
  const query = ((await searchParams).q ?? '').trim();
  const isFiltered = query.length > 0;

  const services = await prisma.maintenanceService.findMany({
    where: isFiltered
      ? {
          OR: [
            { titleEn: { contains: query, mode: 'insensitive' } },
            { titleAr: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'asc' },
  });
  type ServiceRow = (typeof services)[number];

  const title = (row: ServiceRow) =>
    locale === 'ar' ? row.titleAr || row.titleEn : row.titleEn || row.titleAr;

  const columns: AdminTableColumn<ServiceRow>[] = [
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
      // The slug is the service's public URL, so it is the one fact an editor
      // needs at a glance.
      key: 'slug',
      header: t('form.slug'),
      className: 'hidden md:table-cell text-stone-600',
      render: (row) => <span className="font-mono text-xs">{row.slug}</span>,
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/services/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteButton
            compact
            itemName={title(row)}
            redirectTo="/services"
            onDelete={deleteService.bind(null, row.id)}
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
            href={await getPathname({ locale, href: '/services/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && services.length > 0}
          clearHref="/services"
        />
        {services.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/services' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/services/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={services}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
