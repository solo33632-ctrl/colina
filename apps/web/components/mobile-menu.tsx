'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

type NavItem = {
  label: string;
  href: string;
};

type MobileMenuProps = {
  items: NavItem[];
  /** Accessible name for the disclosure button when the panel is closed. */
  openLabel: string;
  /** Accessible name for the disclosure button when the panel is open. */
  closeLabel: string;
  /** Accessible name for the panel itself. */
  menuLabel: string;
  /** Accessible name for the navigation landmark inside the panel. */
  navLabel: string;
};

/**
 * Phone-width navigation. The desktop list is hidden below `sm`, so this
 * disclosure button is the only way to reach the primary links there.
 *
 * The panel is rendered only while open: the closed DOM therefore keeps a
 * single copy of each header link (which existing tests and assistive tech
 * both rely on). Focus moves to the first link on open; Escape closes the
 * panel and returns focus to the button. Body scroll is locked while open,
 * with the scrollbar width added back as inline-end padding so the page does
 * not jump sideways.
 */
export function MobileMenu({
  items,
  openLabel,
  closeLabel,
  menuLabel,
  navLabel,
}: MobileMenuProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  // Escape closes and restores focus to the control that opened the panel.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // Lock body scroll without shifting the layout when the scrollbar goes.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const scrollbarWidth =
      window.innerWidth - document.documentElement.clientWidth;
    const previousOverflow = body.style.overflow;
    const previousPadding = body.style.paddingInlineEnd;
    body.style.overflow = 'hidden';
    if (scrollbarWidth > 0) {
      body.style.paddingInlineEnd = `${scrollbarWidth}px`;
    }
    return () => {
      body.style.overflow = previousOverflow;
      body.style.paddingInlineEnd = previousPadding;
    };
  }, [open]);

  // Move focus into the panel once it exists.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>('a, button')?.focus();
  }, [open]);

  // A resize past the breakpoint removes the button; close the panel so it
  // cannot be left open with no control to dismiss it.
  useEffect(() => {
    if (!open) return;
    const query = window.matchMedia('(min-width: 640px)');
    const onChange = () => {
      if (query.matches) setOpen(false);
    };
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls="mobile-menu"
        aria-label={open ? closeLabel : openLabel}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex h-10 w-10 items-center justify-center rounded text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 sm:hidden"
      >
        {/* Both glyphs are decorative; the button's translated label names
            the action. The lines are direction-neutral, so no mirroring is
            needed in RTL. */}
        <svg
          aria-hidden="true"
          focusable="false"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="h-6 w-6"
        >
          {open ? (
            <path d="M6 6l12 12M18 6L6 18" />
          ) : (
            <path d="M4 7h16M4 12h16M4 17h16" />
          )}
        </svg>
      </button>

      {open ? (
        <div
          ref={panelRef}
          id="mobile-menu"
          aria-label={menuLabel}
          className="absolute inset-x-0 top-full z-50 border-b border-stone-200 bg-white shadow-lg sm:hidden"
        >
          <nav aria-label={navLabel} className="px-4 py-3">
            <ul className="flex flex-col">
              {items.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={close}
                    className="block rounded px-2 py-3 text-base text-stone-700 hover:bg-stone-50 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className="border-t border-stone-200 px-4 py-3" onClick={close}>
            <LanguageSwitcher />
          </div>
        </div>
      ) : null}
    </>
  );
}
