import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { DeleteButton } from '@/components/delete-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ListFilters } from '@/components/list-filters';
import { deleteAgent } from '@/lib/actions/agents';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Agents', 'heading');
}

type Props = {
  searchParams: Promise<{ q?: string }>;
};

export default async function AgentsPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Agents');
  const common = await getTranslations('Common');
  const query = ((await searchParams).q ?? '').trim();
  const isFiltered = query.length > 0;

  const agents = await prisma.agent.findMany({
    where: isFiltered
      ? {
          OR: [
            { countryEn: { contains: query, mode: 'insensitive' } },
            { countryAr: { contains: query, mode: 'insensitive' } },
          ],
        }
      : undefined,
    orderBy: { createdAt: 'asc' },
  });
  type AgentRow = (typeof agents)[number];

  const country = (row: AgentRow) =>
    locale === 'ar'
      ? row.countryAr || row.countryEn
      : row.countryEn || row.countryAr;

  const columns: AdminTableColumn<AgentRow>[] = [
    {
      key: 'name',
      header: common('name'),
      render: (row) => (
        <span
          title={country(row)}
          className="block max-w-[18rem] truncate font-medium text-stone-900"
        >
          {country(row)}
        </span>
      ),
    },
    {
      key: 'details',
      header: common('details'),
      className: 'hidden md:table-cell text-stone-600',
      render: (row) =>
        [locale === 'ar' ? row.cityAr : row.cityEn, row.phone]
          .filter(Boolean)
          .join(common('separator')) || country(row),
    },
    {
      key: 'actions',
      header: common('actions'),
      className: 'text-end',
      render: (row) => (
        <div className="flex items-center justify-end gap-3">
          <Link
            href={`/agents/${row.id}/edit`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('edit')}
          </Link>
          <DeleteButton
            compact
            itemName={country(row)}
            redirectTo="/agents"
            onDelete={deleteAgent.bind(null, row.id)}
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
            href={await getPathname({ locale, href: '/agents/new' })}
            size="sm"
          >
            {t('new')}
          </Button>
        </div>
        <ListFilters
          query={query}
          filtered={isFiltered && agents.length > 0}
          clearHref="/agents"
        />
        {agents.length === 0 ? (
          <ListEmptyState
            message={isFiltered ? common('noResults') : t('empty')}
            clearHref={isFiltered ? '/agents' : undefined}
            createHref={
              isFiltered
                ? undefined
                : await getPathname({ locale, href: '/agents/new' })
            }
            createLabel={isFiltered ? undefined : t('createFirst')}
          />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={agents}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
