import { prisma } from '@colina/db';
import { getLocale } from 'next-intl/server';
import { getPathname } from '@/i18n/navigation';
import { Button, Card, Container } from '@colina/ui';

export default async function AdminHomePage() {
  const locale = await getLocale();
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
        ['/categories', `Categories (${categoryCount})`],
        ['/machines', `Machines (${machineCount})`],
        ['/partners', `Partners (${partnerCount})`],
        ['/services', `Services (${serviceCount})`],
        ['/news', `News (${newsCount})`],
        ['/agents', `Agents (${agentCount})`],
      ] as const
    ).map(async ([href, label]) => ({
      href: await getPathname({ locale, href }),
      label,
    }))
  );

  return (
    <main>
      <Container className="py-16">
        <Card title="Colina Admin" description="Manage site content.">
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
