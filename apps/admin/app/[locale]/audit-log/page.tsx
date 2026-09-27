import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { requireSuperAdmin } from '@/lib/admin-action';
import { intlLocale } from '@/lib/format';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'AuditLog', 'heading');
}

const PAGE_SIZE = 20;

type Props = {
  searchParams: Promise<{ page?: string }>;
};

export default async function AuditLogPage({ searchParams }: Props) {
  const locale = await getLocale();
  const t = await getTranslations('AuditLog');
  const common = await getTranslations('Common');

  // First role gate in the project: editors get an explanatory page,
  // not a bare 403 (proxy.ts only checks for a session, not the role).
  const session = await requireSuperAdmin();
  if (!session) {
    return (
      <main>
        <Container className="max-w-2xl py-16">
          <Card
            title={t('notAuthorizedTitle')}
            description={t('notAuthorizedDescription')}
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
        <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
        {entries.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <>
            <ul className="mt-6 grid gap-4">
              {entries.map((entry) => (
                <li key={entry.id}>
                  <Card>
                    <p className="font-semibold text-stone-900">
                      {/* Stored codes, deliberately verbatim: the action and
                          entity are an audit trail, and an operator matching
                          them against the database needs them exact. */}
                      {entry.action}{' '}
                      <span className="font-normal text-stone-500">
                        {entry.entity}
                      </span>
                    </p>
                    <p className="mt-1 text-sm text-stone-500">
                      {entry.adminUser?.email ?? t('deletedAdmin')}
                      {common('separator')}
                      {entry.createdAt.toLocaleString(intlLocale(locale))}
                    </p>
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
                    href={`/audit-log?page=${safePage - 1}`}
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
                    href={`/audit-log?page=${safePage + 1}`}
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
