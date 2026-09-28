import type { ReactNode } from 'react';
import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { getAdminSession } from '@/lib/auth';
import { sidebarGroups } from '@/lib/sidebar';
import { AdminFooter } from './footer';
import { AdminSidebar } from './sidebar';
import { AuthHeader } from './auth-header';
import { AdminTopBar } from './top-bar';

// The admin app shell: a docked sidebar on large screens (the drawer takes
// over below `lg`) plus a page column holding the top bar, the page and the
// footer.
export async function AdminAppShell({ children }: { children: ReactNode }) {
  const session = await getAdminSession();

  // No session means login / forgot-password / reset-password: proxy.ts
  // redirects every other route to the login page, and those three redirect
  // an existing session back to the dashboard. So this branch is exactly the
  // public auth screens, which stay centered and free of admin chrome.
  if (!session?.user) {
    return (
      <>
        <AuthHeader />
        {children}
        <AdminFooter />
      </>
    );
  }

  const t = await getTranslations('Nav');

  // Both lead tables land in the same inbox, so the badge is the total of the
  // untouched ones. A plain count: no rows are read, and the shell is
  // dynamic (the session is read from a cookie) so it refreshes per request.
  const [newContacts, newRequests] = await Promise.all([
    prisma.contactMessage.count({ where: { status: 'NEW' } }),
    prisma.maintenanceRequest.count({ where: { status: 'NEW' } }),
  ]);

  const groups = sidebarGroups({
    role: session.user.role,
    newLeadCount: newContacts + newRequests,
    t,
  });

  return (
    <div className="flex min-h-screen">
      <aside className="hidden lg:sticky lg:top-0 lg:flex lg:h-screen lg:w-72 lg:shrink-0 lg:self-start lg:flex-col lg:overflow-hidden lg:border-e lg:border-stone-200 lg:bg-white">
        <AdminSidebar groups={groups} />
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopBar
          groups={groups}
          email={session.user.email ?? ''}
          roleLabel={
            session.user.role === 'SUPER_ADMIN'
              ? t('roleSuperAdmin')
              : t('roleEditor')
          }
        />
        <div className="flex-1">{children}</div>
        <AdminFooter />
      </div>
    </div>
  );
}
