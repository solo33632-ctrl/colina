import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Card, Container } from '@colina/ui';
import { Link, getPathname } from '@/i18n/navigation';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { DeleteUserButton } from '@/components/delete-user-button';
import { ListEmptyState } from '@/components/list-empty-state';
import { ResetPasswordButton } from '@/components/reset-password-button';
import { SaveBanner } from '@/components/save-banner';
import { intlLocale } from '@/lib/format';
import { sectionMetadata } from '@/lib/metadata';
import { requirePermission } from '@/lib/permissions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Users', 'heading');
}

type Props = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function UsersPage({ searchParams }: Props) {
  const session = await requirePermission('users:manage');
  if (!session) {
    const t = await getTranslations('Users');
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

  const locale = await getLocale();
  const t = await getTranslations('Users');
  const common = await getTranslations('Common');
  const { saved } = await searchParams;

  const users = await prisma.adminUser.findMany({
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      createdAt: true,
      _count: {
        select: {
          auditLogs: true,
          createdMachines: true,
          createdMachineCategories: true,
        },
      },
    },
  });

  type UserRow = (typeof users)[number];

  const intl = intlLocale(locale);
  const fullDate = (date: Date) =>
    date.toLocaleString(intl, { dateStyle: 'medium', timeStyle: 'short' });

  const roleLabel = (row: UserRow) =>
    row.role === 'SUPER_ADMIN' ? t('roles.admin') : t('roles.editor');

  const columns: AdminTableColumn<UserRow>[] = [
    {
      key: 'name',
      header: t('table.name'),
      render: (row) => (
        <span className="font-medium text-stone-900">
          {row.name ?? common('none')}
        </span>
      ),
    },
    {
      key: 'email',
      header: t('table.email'),
      render: (row) => (
        <span dir="ltr" className="break-all text-stone-700">
          {row.email}
        </span>
      ),
    },
    {
      key: 'role',
      header: t('table.role'),
      render: (row) => (
        <span
          className={
            row.role === 'SUPER_ADMIN'
              ? 'inline-flex rounded-full border border-brand-200 bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-800'
              : 'inline-flex rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700'
          }
        >
          {roleLabel(row)}
        </span>
      ),
    },
    {
      key: 'created',
      header: t('table.created'),
      render: (row) => (
        <span className="whitespace-nowrap text-stone-600">
          {fullDate(row.createdAt)}
        </span>
      ),
    },
    {
      key: 'lastLogin',
      header: t('table.lastLogin'),
      // No login timestamp is stored yet; showing an em-dash is honest and
      // leaves the column ready for the value when it exists.
      render: () => <span className="text-stone-400">{common('none')}</span>,
    },
    {
      key: 'actionsCount',
      header: t('table.actionsCount'),
      render: (row) => (
        <span className="tabular-nums">{row._count.auditLogs}</span>
      ),
    },
    {
      key: 'machinesCount',
      header: t('table.machinesCount'),
      render: (row) => (
        <span className="tabular-nums">{row._count.createdMachines}</span>
      ),
    },
    {
      key: 'categoriesCount',
      header: t('table.categoriesCount'),
      render: (row) => (
        <span className="tabular-nums">
          {row._count.createdMachineCategories}
        </span>
      ),
    },
    {
      key: 'actions',
      header: common('actions'),
      render: (row) => (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <Link
            href={`/users/${row.id}`}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t('actions.activity')}
          </Link>
          {row.role === 'EDITOR' ? (
            <>
              <ResetPasswordButton userId={row.id} email={row.email} />
              <DeleteUserButton
                userId={row.id}
                email={row.email}
                machineCount={row._count.createdMachines}
                categoryCount={row._count.createdMachineCategories}
              />
            </>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <main>
      <Container className="py-10">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-stone-900">
              {t('heading')}
            </h1>
            <p className="mt-2 text-sm text-stone-600">{t('intro')}</p>
          </div>
          <Button href={await getPathname({ locale, href: '/users/new' })}>
            {t('create')}
          </Button>
        </div>

        {saved ? <SaveBanner message={t('saved')} /> : null}

        {users.length === 0 ? (
          <ListEmptyState message={t('empty')} />
        ) : (
          <AdminTable
            label={t('heading')}
            columns={columns}
            rows={users}
            rowKey={(row) => row.id}
          />
        )}
      </Container>
    </main>
  );
}
