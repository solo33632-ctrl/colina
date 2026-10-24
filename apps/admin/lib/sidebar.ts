import type { AdminRole } from '@colina/db';
import type { IconName } from '@/components/icons';

// Sidebar structure: which groups exist, in which order, and what each item
// points at. Kept in one place so the desktop sidebar and the mobile drawer
// can never drift apart, and so the role gates below are the single place the
// super-admin-only entries are decided.
//
// Labels are resolved by the caller (a Server Component with `getTranslations`)
// and passed in already translated: this module stays free of runtime imports
// so both the server shell and the client nav can use its types.

export type SidebarLabelKey =
  | 'groupOverview'
  | 'groupCatalog'
  | 'groupMaintenance'
  | 'groupContent'
  | 'groupInbox'
  | 'groupSystem'
  | 'dashboard'
  | 'categories'
  | 'machines'
  | 'partners'
  | 'services'
  | 'maintenanceShowcase'
  | 'maintenanceCategories'
  | 'news'
  | 'agents'
  | 'leads'
  | 'auditLog'
  | 'insights';

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
      // The public site presents these three as one maintenance area: the
      // production lines, the before/after showcase machines on those lines,
      // and the services that keep them running. Keeping them in one group
      // matches the way staff think about the work, and stops the services
      // entry from reading as a generic catalog item.
      id: 'maintenance',
      label: t('groupMaintenance'),
      items: [
        // The lines the showcase machines belong to. The folder glyph marks
        // it as a grouping entity.
        {
          href: '/maintenance-categories',
          label: t('maintenanceCategories'),
          icon: 'categories',
        },
        // The split-frame glyph echoes the before/after slider these entries
        // manage, and keeps the three adjacent icons distinct.
        {
          href: '/maintenance-showcase',
          label: t('maintenanceShowcase'),
          icon: 'compare',
        },
        { href: '/services', label: t('services'), icon: 'services' },
      ],
    },
    {
      id: 'content',
      label: t('groupContent'),
      items: [
        { href: '/partners', label: t('partners'), icon: 'partners' },
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
        // SUPER_ADMIN only, and each page re-checks with requireSuperAdmin():
        // the audit log shows what staff did, the insights dashboard shows
        // visitor IP addresses and refused requests. Hiding the link is a
        // convenience, never the protection.
        ...(role === 'SUPER_ADMIN'
          ? [
              {
                href: '/insights',
                label: t('insights'),
                icon: 'insights' as const,
              },
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
