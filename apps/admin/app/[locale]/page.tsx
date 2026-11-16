import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { hasLocale } from 'next-intl';
import { notFound, redirect } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { routing } from '@/i18n/routing';
import { requirePermission } from '@/lib/permissions';
import type { IconName } from '@/components/icons';
import {
  LatestLeadsPanel,
  type LatestLead,
} from '@/components/latest-leads-panel';
import {
  RecentActivityPanel,
  type ActivityEntry,
} from '@/components/recent-activity-panel';
import { StatCard } from '@/components/stat-card';

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

const RECENT_LIMIT = 5;

export default async function AdminHomePage() {
  const t = await getTranslations('Dashboard');

  // Stage 4a: the dashboard is not an editor screen. An editor is sent to the
  // machines list before any count or lead query runs.
  const session = await requirePermission('dashboard:read');
  if (!session) {
    const locale = await getLocale();
    redirect(`/${locale}/machines`);
  }

  // Only SUPER_ADMIN holds dashboard:read, so the audit panel below is
  // always allowed here; keeping the variable makes that explicit.
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN';

  const [
    categoryCount,
    machineCount,
    partnerCount,
    serviceCount,
    newsCount,
    agentCount,
    newContactCount,
    newRequestCount,
    recentContacts,
    recentRequests,
    recentActivity,
  ] = await Promise.all([
    prisma.machineCategory.count(),
    prisma.machine.count(),
    prisma.partner.count(),
    prisma.maintenanceService.count(),
    prisma.newsPost.count(),
    prisma.agent.count(),
    prisma.contactMessage.count({ where: { status: 'NEW' } }),
    prisma.maintenanceRequest.count({ where: { status: 'NEW' } }),
    // Merging the newest rows of both lead tables is the leads inbox's
    // approach. Taking `RECENT_LIMIT` per table first is still exact: a row
    // that is not among the newest of its own table cannot be among the newest
    // overall.
    prisma.contactMessage.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    }),
    prisma.maintenanceRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: RECENT_LIMIT,
    }),
    isSuperAdmin
      ? prisma.auditLog.findMany({
          orderBy: { createdAt: 'desc' },
          take: RECENT_LIMIT,
          include: { adminUser: { select: { email: true } } },
        })
      : Promise.resolve([]),
  ]);

  const latestLeads: LatestLead[] = [
    ...recentContacts.map((lead) => ({
      id: lead.id,
      kind: 'contact' as const,
      name: lead.name,
      status: lead.status,
      createdAt: lead.createdAt,
    })),
    ...recentRequests.map((lead) => ({
      id: lead.id,
      kind: 'maintenance' as const,
      name: lead.name,
      status: lead.status,
      createdAt: lead.createdAt,
    })),
  ]
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, RECENT_LIMIT);

  const activity: ActivityEntry[] = recentActivity.map((entry) => ({
    id: entry.id,
    action: entry.action,
    entity: entry.entity,
    details: entry.details,
    createdAt: entry.createdAt,
    adminEmail: entry.adminUser?.email ?? null,
  }));

  // New leads first: it is the only tile with a queue behind it.
  const stats: {
    href: string;
    label: string;
    count: number;
    icon: IconName;
    highlighted?: boolean;
  }[] = [
    {
      // The leads inbox already reads `?status=`, so the tile can drop the
      // operator straight onto the untouched queue.
      href: '/leads?status=NEW',
      label: t('newLeads'),
      count: newContactCount + newRequestCount,
      icon: 'leads',
      highlighted: true,
    },
    {
      href: '/categories',
      label: t('categories'),
      count: categoryCount,
      icon: 'categories',
    },
    {
      href: '/machines',
      label: t('machines'),
      count: machineCount,
      icon: 'machines',
    },
    {
      href: '/partners',
      label: t('partners'),
      count: partnerCount,
      icon: 'partners',
    },
    {
      href: '/services',
      label: t('services'),
      count: serviceCount,
      icon: 'services',
    },
    { href: '/news', label: t('news'), count: newsCount, icon: 'news' },
    { href: '/agents', label: t('agents'), count: agentCount, icon: 'agents' },
  ];

  return (
    <main>
      <Container className="py-10">
        <h1 className="text-2xl font-bold text-stone-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-stone-600">{t('description')}</p>

        <ul className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {stats.map((stat) => (
            <li key={stat.href}>
              <StatCard {...stat} />
            </li>
          ))}
        </ul>

        {/* An editor only ever gets the leads panel, so the row is not split in
            two for them. */}
        <div
          className={isSuperAdmin ? 'mt-6 grid gap-4 lg:grid-cols-2' : 'mt-6'}
        >
          <LatestLeadsPanel leads={latestLeads} />
          {isSuperAdmin ? <RecentActivityPanel entries={activity} /> : null}
        </div>
      </Container>
    </main>
  );
}
