import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Dashboard' });
  return { title: t('title'), description: t('description') };
}

export default async function AdminHomePage() {
  const locale = await getLocale();
  const t = await getTranslations('Dashboard');
  const [
    categoryCount,
    machineCount,
    partnerCount,
    serviceCount,
    newsCount,
    agentCount,
  ] = await Promise.all([
    prisma.machineCategory.count(),
    prisma.machine.count(),
    prisma.partner.count(),
    prisma.maintenanceService.count(),
    prisma.newsPost.count(),
    prisma.agent.count(),
  ]);

  // `Button` with `href` renders a plain anchor, so the locale prefix has to
  // be resolved here (the locale-aware `Link` would do it automatically).
  const sections = await Promise.all(
    (
      [
        ['/categories', t('categories', { count: categoryCount })],
        ['/machines', t('machines', { count: machineCount })],
        ['/partners', t('partners', { count: partnerCount })],
        ['/services', t('services', { count: serviceCount })],
        ['/news', t('news', { count: newsCount })],
        ['/agents', t('agents', { count: agentCount })],
      ] as const
    ).map(async ([href, label]) => ({
      href: await getPathname({ locale, href }),
      label,
    }))
  );

  return (
    <main>
      <Container className="py-16">
        <Card title={t('title')} description={t('description')}>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            {sections.map((section) => (
              <li key={section.href}>
                <Button
                  href={section.href}
                  variant="secondary"
                  className="w-full"
                >
                  {section.label}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      </Container>
    </main>
  );
}
