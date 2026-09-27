import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Agents', 'heading');
}

export default async function AgentsPage() {
  const locale = await getLocale();
  const t = await getTranslations('Agents');
  const common = await getTranslations('Common');
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
          <Button
            href={await getPathname({ locale, href: '/agents/new' })}
            size="sm"
          >
            New agent
          </Button>
        </div>
        {agents.length === 0 ? (
          <Card className="mt-6" description={t('empty')} />
        ) : (
          <ul className="mt-6 grid gap-4">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {agent.countryEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {[agent.cityEn, agent.phone]
                          .filter(Boolean)
                          .join(' · ') || agent.countryAr}
                      </p>
                    </div>
                    <Link
                      href={`/agents/${agent.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {common('edit')}
                    </Link>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
