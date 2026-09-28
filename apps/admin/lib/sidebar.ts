import type { AdminRole } from '@colina/db';
import type { IconName } from '@/components/icons';

// Sidebar structure: which groups exist, in which order, and what each item
// points at. Kept in one place so the desktop sidebar and the mobile drawer
// can never drift apart, and so the role gate below is the single place the
// audit-log entry is decided.
//
// Labels are resolved by the caller (a Server Component with `getTranslations`)
// and passed in already translated: this module stays free of runtime imports
// so both the server shell and the client nav can use its types.

export type SidebarLabelKey =
  | 'groupOverview'
  | 'groupCatalog'
  | 'groupContent'
  | 'groupInbox'
  | 'groupSystem'
  | 'dashboard'
  | 'categories'
  | 'machines'
  | 'partners'
  | 'services'
  | 'news'
  | 'agents'
  | 'leads'
  | 'auditLog';

export type SidebarItem = {
  href: string;
  label: string;
  icon: IconName;
  /** Rendered as a small badge; only set for the leads inbox. */
  badge?: number;
};

export type SidebarGroup = {
  id: string;
  label: string;
  items: SidebarItem[];
};

type SidebarLabels = (key: SidebarLabelKey) => string;

export function sidebarGroups(options: {
  role: AdminRole;
  newLeadCount: number;
  t: SidebarLabels;
}): SidebarGroup[] {
  const { role, newLeadCount, t } = options;

  const groups: SidebarGroup[] = [
    {
      id: 'overview',
      label: t('groupOverview'),
      items: [{ href: '/', label: t('dashboard'), icon: 'dashboard' }],
    },
    {
      id: 'catalog',
      label: t('groupCatalog'),
      items: [
        { href: '/categories', label: t('categories'), icon: 'categories' },
        { href: '/machines', label: t('machines'), icon: 'machines' },
      ],
    },
    {
      id: 'content',
      label: t('groupContent'),
      items: [
        { href: '/partners', label: t('partners'), icon: 'partners' },
        { href: '/services', label: t('services'), icon: 'services' },
        { href: '/news', label: t('news'), icon: 'news' },
        { href: '/agents', label: t('agents'), icon: 'agents' },
      ],
    },
    {
      id: 'inbox',
      label: t('groupInbox'),
      items: [
        {
          href: '/leads',
          label: t('leads'),
          icon: 'leads',
          // Both lead tables feed the same inbox page, so the badge is the sum.
          badge: newLeadCount,
        },
      ],
    },
    {
      id: 'system',
      label: t('groupSystem'),
      items: [
        // SUPER_ADMIN only — the page itself re-checks with requireSuperAdmin().
        ...(role === 'SUPER_ADMIN'
          ? [
              {
                href: '/audit-log',
                label: t('auditLog'),
                icon: 'auditLog' as const,
              },
            ]
          : []),
      ],
    },
  ];

  // An editor has no entry in the last group, so its heading would otherwise
  // be rendered on its own.
  return groups.filter((group) => group.items.length > 0);
}
