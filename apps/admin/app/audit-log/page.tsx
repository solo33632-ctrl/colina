import { prisma } from '@colina/db';
import { Card, Container } from '@colina/ui';
import { requireSuperAdmin } from '@/lib/admin-action';

export const metadata = {
  title: 'Audit log — Colina Admin',
};

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AuditLogPage({ searchParams }: Props) {
  // First role gate in the project: editors get an explanatory page,
  // not a bare 403 (proxy.ts only checks for a session, not the role).
  const session = await requireSuperAdmin();
  if (!session) {
    return (
      <main>
        <Container className="max-w-2xl py-16">
          <Card
            title="Not authorized"
            description="The audit log is restricted to super admins. Your editor account cannot view this page."
          />
        </Container>
      </main>
    );
  }

  const params = await searchParams;
  const parsed = Number.parseInt(params.page ?? '', 10);
  const page = Number.isInteger(parsed) && parsed > 0 ? parsed : 1;

  const total = await prisma.auditLog.count();
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const entries = await prisma.auditLog.findMany({
    orderBy: { createdAt: 'desc' },
    skip: (safePage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    include: { adminUser: { select: { email: true } } },
  });

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">Audit log</h1>
        {entries.length === 0 ? (
          <Card className="mt-6" description="No audit entries yet." />
        ) : (
          <>
            <ul className="mt-6 grid gap-4">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Card>
                    <p className="font-semibold text-stone-900">
                      {entry.action}{' '}
                      <span className="font-normal text-stone-500">
                        {entry.entity}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {entry.adminUser?.email ?? '(deleted admin)'} ·{' '}
                      {entry.createdAt.toLocaleString('en-GB')}
                    </p>
                  </Card>
                </li>
              ))}
            </ul>
            {totalPages > 1 ? (
              <nav
                aria-label="Audit log pages"
                className="mt-6 flex items-center justify-center gap-4"
              >
                {safePage > 1 ? (
                  <a
                    href={`/audit-log?page=${safePage - 1}`}
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
                    href={`/audit-log?page=${safePage + 1}`}
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
