'use client';

import { useEffect, useRef } from 'react';
import { useTranslations } from 'next-intl';
import { AdminSidebar } from './sidebar';
import { Icon } from './icons';
import type { SidebarGroup } from '@/lib/sidebar';

// Id shared with the hamburger's `aria-controls` in the top bar.
export const SIDEBAR_DRAWER_ID = 'admin-sidebar-drawer';

// Off-canvas sidebar for viewports below `lg`, where the docked sidebar is
// hidden. It is pinned to the inline-start edge, so the closed offset has to
// point away from the content: negative in LTR, positive in RTL.
export function SidebarDrawer({
  groups,
  open,
  onClose,
}: {
  groups: SidebarGroup[];
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Nav');
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      closeRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  return (
    <>
      <div
        aria-hidden="true"
        onClick={onClose}
        className={[
          'fixed inset-0 z-30 bg-stone-900/40 transition-opacity duration-200 lg:hidden',
          open ? 'opacity-100' : 'pointer-events-none opacity-0',
        ].join(' ')}
      />
      <aside
        id={SIDEBAR_DRAWER_ID}
        // A translated-off-screen panel is still in the tab order, so it is
        // made inert while closed rather than only visually hidden.
        inert={!open}
        className={[
          'fixed inset-y-0 start-0 z-40 w-72 border-e border-stone-200 bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden',
          open ? 'translate-x-0' : 'ltr:-translate-x-full rtl:translate-x-full',
        ].join(' ')}
      >
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t('closeMenu')}
          className="absolute end-2 top-3.5 rounded-lg p-2 text-stone-500 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Icon name="close" className="h-5 w-5" />
        </button>
        <AdminSidebar groups={groups} onNavigate={onClose} />
      </aside>
    </>
  );
}
