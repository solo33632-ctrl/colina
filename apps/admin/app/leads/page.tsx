import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Leads — Colina Admin',
};

const PAGE_SIZE = 20;

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;
type StatusFilter = (typeof STATUSES)[number] | 'ALL';

function parseStatus(value: string | undefined): StatusFilter {
  return value === 'NEW' || value === 'IN_PROGRESS' || value === 'RESOLVED'
    ? value
    : 'ALL';
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

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">Leads</h1>
        <form method="get" className="mt-6 flex items-end gap-3">
          <div>
            <label
              htmlFor="lead-status-filter"
              className="mb-1 block text-sm font-medium text-stone-700"
            >
              Filter by status
            </label>
            <select
              id="lead-status-filter"
              name="status"
              defaultValue={statusFilter}
              className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
            >
              <option value="ALL">All</option>
              {STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>
          <Button type="submit" variant="secondary" size="sm">
            Filter
          </Button>
        </form>
        {visible.length === 0 ? (
          <Card className="mt-6" description="No leads match this filter." />
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
                          <span className="ml-2 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                            {lead.kind === 'contact'
                              ? 'Contact'
                              : 'Maintenance'}
                          </span>
                        </p>
                        <p className="text-sm text-stone-500">
                          {lead.summary} · {lead.status} ·{' '}
                          {lead.createdAt.toLocaleDateString('en-GB')}
                        </p>
                      </div>
                      <a
                        href={`/leads/${lead.kind}/${lead.id}`}
                        className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                      >
                        View
                      </a>
                    </div>
                  </Card>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav
                aria-label="Leads pages"
                className="mt-6 flex items-center justify-center gap-4"
              >
                {safePage > 1 ? (
                  <a
                    href={`/leads?status=${statusFilter}&page=${safePage - 1}`}
                    className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    Previous
                  </a>
                ) : null}
                <span className="text-sm text-stone-500">
                  Page {safePage} of {totalPages}
                </span>
                {safePage < totalPages ? (
                  <a
                    href={`/leads?status=${statusFilter}&page=${safePage + 1}`}
                    className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
                  >
                    Next
                  </a>
                ) : null}
              </nav>
            ) : null}
          </>
        )}
      </Container>
    </main>
  );
}
