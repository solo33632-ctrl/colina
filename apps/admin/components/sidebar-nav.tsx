'use client';

import { useTranslations } from 'next-intl';
import { Icon } from './icons';
import { Link, usePathname } from '@/i18n/navigation';
import type { SidebarGroup, SidebarItem } from '@/lib/sidebar';

export type { SidebarGroup, SidebarItem };

// The sidebar list. `usePathname` comes from @/i18n/navigation, so it returns
// the path without the locale prefix and matches the locale-less `href` in
// lib/sidebar.ts in both `/ar` and `/en`.
export function SidebarNav({
  groups,
  onNavigate,
}: {
  groups: SidebarGroup[];
  onNavigate?: () => void;
}) {
  const t = useTranslations('Nav');
  const pathname = usePathname();

  return (
    <nav
      aria-label={t('sectionsLabel')}
      className="flex-1 overflow-y-auto px-3 py-4"
    >
      {groups.map((group) => (
        <div key={group.id} className="mb-6 last:mb-0">
          <p className="px-3 pb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
            {group.label}
          </p>
          <ul className="space-y-1">
            {group.items.map((item) => {
              const active = isActive(pathname, item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={[
                      'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
                      active
                        ? 'bg-brand-50 text-brand-800'
                        : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900',
                    ].join(' ')}
                  >
                    <Icon
                      name={item.icon}
                      className={[
                        'h-5 w-5 shrink-0',
                        active ? 'text-brand-700' : 'text-stone-400',
                      ].join(' ')}
                    />
                    <span className="truncate">{item.label}</span>
                    {item.badge ? (
                      <span
                        title={t('newLeads', { count: item.badge })}
                        className="ms-auto rounded-full bg-brand-600 px-2 py-0.5 text-xs font-semibold text-white"
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

// A section stays highlighted on its detail pages (`/machines/new`,
// `/leads/contact/<id>`) so the current area is never ambiguous. The dashboard
// sits at the root, so it only matches exactly.
function isActive(pathname: string, href: string): boolean {
  if (href === '/') {
    return pathname === '/';
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}
