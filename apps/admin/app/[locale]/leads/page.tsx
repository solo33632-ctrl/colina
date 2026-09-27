import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { intlLocale } from '@/lib/format';
import { isLeadStatus, LEAD_STATUSES } from '@/lib/lead-status';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Leads', 'heading');
}

const PAGE_SIZE = 20;

type StatusFilter = (typeof LEAD_STATUSES)[number] | 'ALL';

function parseStatus(value: string | undefined): StatusFilter {
  return value !== undefined && isLeadStatus(value) ? value : 'ALL';
}

function parsePage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

type Props = {
  searchParams: Promise<{ status?: string; page?: string }>;
};

type LeadRow = {
  kind: 'contact' | 'maintenance';
  id: string;
  name: string;
  summary: string;
  status: string;
  createdAt: Date;
};

export default async function LeadsPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('Leads');
  const common = await getTranslations('Common');
  const params = await searchParams;
  const statusFilter = parseStatus(params.status);
  const page = parsePage(params.page);
  const where = statusFilter === 'ALL' ? undefined : { status: statusFilter };

  // Small-scale inbox: fetch both tables, merge newest-first in memory,
  // then slice the page. (Per-table offset/limit can't merge correctly;
  // cursor pagination belongs to a high-volume future.)
  const [contacts, requests] = await Promise.all([
    prisma.contactMessage.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }),
    prisma.maintenanceRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const leads: LeadRow[] = [
    ...contacts.map((row) => ({
      kind: 'contact' as const,
      id: row.id,
      name: row.name,
      summary: row.email ?? row.phone ?? '',
      status: row.status,
      createdAt: row.createdAt,
    })),
    ...requests.map((row) => ({
      kind: 'maintenance' as const,
      id: row.id,
      name: row.name,
      summary: row.company ?? row.machineModel ?? '',
      status: row.status,
      createdAt: row.createdAt,
    })),
  ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

  const totalPages = Math.max(1, Math.ceil(leads.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const visible = leads.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // A status read back from the enum column is always one of the known
  // codes, so the guard holds and the raw value is only a defensive
  // fallback that a schema change would surface rather than hide.
  const statusLabel = (status: string) =>
    isLeadStatus(status) ? t(`statuses.${status}`) : status;

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
        {/* GET form: submitting to the current URL keeps the locale prefix. */}
        <form method="get" className="mt-6 flex items-end gap-3">
          <div>
            <label
              htmlFor="lead-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              {common('filterByStatus')}
            </label>
            <select
              id="lead-status-filter"
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="ALL">{common('all')}</option>
              {LEAD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(status)}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">
            {common('filter')}
          </Button>
        </form>
        {visible.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <>
            <ul className="mt-6 grid gap-4">
              {visible.map((lead) => (
                <li key={`${lead.kind}-${lead.id}`}>
                  <Card>
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-semibold text-stone-900">
                          {lead.name}{' '}
                          <span className="ms-2 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                            {t(`kinds.${lead.kind}`)}
                          </span>
                        </p>
                        <p className="text-sm text-stone-500">
                          {lead.summary}
                          {common('separator')}
                          {statusLabel(lead.status)}
                          {common('separator')}
                          {lead.createdAt.toLocaleDateString(
                            intlLocale(locale)
                          )}
                        </p>
                      </div>
                      <Link
                        href={`/leads/${lead.kind}/${lead.id}`}
                        className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        {common('view')}
                      </Link>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav
                aria-label={t('pagesLabel')}
                className="mt-6 flex items-center justify-center gap-4"
              >
                {safePage > 1 ? (
                  <Link
                    href={`/leads?status=${statusFilter}&page=${safePage - 1}`}
                    className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {common('previous')}
                  </Link>
                ) : null}
                <span className="text-sm text-stone-500">
                  {common('pageOf', {
                    current: safePage,
                    total: totalPages,
                  })}
                </span>
                {safePage < totalPages ? (
                  <Link
                    href={`/leads?status=${statusFilter}&page=${safePage + 1}`}
                    className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    {common('next')}
                  </Link>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </Container>
    </main>
  );
}
