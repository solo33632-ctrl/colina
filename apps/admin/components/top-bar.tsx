'use client';

import { useEffect, useRef, useState } from 'react';
import { useTranslations } from 'next-intl';
import { AdminLanguageSwitcher } from './language-switcher';
import { Icon } from './icons';
import { LogoutButton } from './logout-button';
import { SidebarDrawer, SIDEBAR_DRAWER_ID } from './sidebar-drawer';
import type { SidebarGroup } from '@/lib/sidebar';

// Top bar of the page column. It owns the drawer state because the hamburger
// that opens the drawer lives here, and the drawer is rendered as a sibling of
// the bar so the navigation panel is not nested inside a <header>.
export function AdminTopBar({
  groups,
  email,
  roleLabel,
}: {
  groups: SidebarGroup[];
  email: string;
  roleLabel: string;
}) {
  const t = useTranslations('Nav');
  const [open, setOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const wasOpen = useRef(false);

  // Focus goes to the drawer's close button on open (handled there) and back
  // to the hamburger on close. The previous state is tracked so a plain
  // re-render never steals focus away from the page.
  useEffect(() => {
    if (wasOpen.current && !open) {
      triggerRef.current?.focus();
    }
    wasOpen.current = open;
  }, [open]);

  return (
    <>
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setOpen(true)}
            aria-expanded={open}
            aria-controls={SIDEBAR_DRAWER_ID}
            aria-label={t('openMenu')}
            className="-ms-2 rounded-lg p-2 text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 lg:hidden"
          >
            <Icon name="menu" className="h-6 w-6" />
          </button>
          <div className="ms-auto flex items-center gap-3">
            <AdminLanguageSwitcher />
            <div className="flex flex-col items-end text-sm leading-tight">
              <span className="max-w-[9rem] truncate font-medium text-stone-800 sm:max-w-xs">
                {email}
              </span>
              <span className="text-xs text-stone-500">{roleLabel}</span>
            </div>
            <LogoutButton />
          </div>
        </div>
      </header>
      <SidebarDrawer
        groups={groups}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
