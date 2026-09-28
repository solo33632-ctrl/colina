'use client';

import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { SidebarNav } from './sidebar-nav';
import type { SidebarGroup } from '@/lib/sidebar';

// The sidebar panel: brand bar plus the grouped nav. Rendered twice by the
// app shell — once docked on large screens, once inside the mobile drawer —
// so both stay in sync from the same data.
export function AdminSidebar({
  groups,
  onNavigate,
}: {
  groups: SidebarGroup[];
  onNavigate?: () => void;
}) {
  const t = useTranslations('Nav');

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-16 shrink-0 items-center border-b border-stone-200 px-4">
        <Link
          href="/"
          onClick={onNavigate}
          className="truncate rounded text-base font-bold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('brand')}
        </Link>
      </div>
      <SidebarNav groups={groups} onNavigate={onNavigate} />
    </div>
  );
}
