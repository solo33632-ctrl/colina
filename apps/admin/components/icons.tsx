import type { ReactNode } from 'react';

// Local icon set for the admin shell.
//
// Inline SVG instead of an icon package: the admin needs ten glyphs, and a
// dependency for that would be dead weight. Every glyph is drawn on the same
// 24×24 grid with `currentColor` strokes so it inherits the text colour of
// whatever it sits in (inactive item, active item, button). They are all
// decorative — the surrounding link or button always carries a translated
// label — so the SVG itself is hidden from assistive technology.
export type IconName =
  | 'dashboard'
  | 'categories'
  | 'machines'
  | 'partners'
  | 'services'
  | 'news'
  | 'agents'
  | 'leads'
  | 'auditLog'
  | 'menu'
  | 'close'
  | 'trash'
  | 'spinner'
  | 'check'
  | 'chevron';

const GLYPHS: Record<IconName, ReactNode> = {
  // Four tiles.
  dashboard: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  // Folder with a tab.
  categories: (
    <>
      <path d="M3 7a2 2 0 0 1 2-2h3.6a2 2 0 0 1 1.5.7l1 1.3H19a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
      <path d="M3 11h18" />
    </>
  ),
  // Gear: a ring with radial teeth.
  machines: (
    <>
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M18.4 5.6l-1.8 1.8M7.4 16.6l-1.8 1.8" />
    </>
  ),
  // Two people.
  partners: (
    <>
      <circle cx="9" cy="8" r="3.25" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 5.2a3.25 3.25 0 0 1 0 5.6" />
      <path d="M17.6 14.4A6 6 0 0 1 21 20" />
    </>
  ),
  // Wrench and hammer (Feather's "tool" outline).
  services: (
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  ),
  // Newspaper.
  news: (
    <>
      <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4h10A1.5 1.5 0 0 1 17 5.5V18a2 2 0 0 0 2 2H5.5A1.5 1.5 0 0 1 4 18.5v-13Z" />
      <path d="M17 8.5h1.5A1.5 1.5 0 0 1 20 10v8a2 2 0 0 1-2 2" />
      <path d="M7 8h7M7 11.5h7M7 15h4.5" />
    </>
  ),
  // Globe.
  agents: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M3.5 12h17" />
      <path d="M12 3.5c2.2 2.4 3.4 5.4 3.4 8.5S14.2 18.1 12 20.5c-2.2-2.4-3.4-5.4-3.4-8.5S9.8 5.9 12 3.5Z" />
    </>
  ),
  // Inbox tray.
  leads: (
    <>
      <path d="M3 12.5h4.5l1.4 2.6h6.2l1.4-2.6H21" />
      <path d="M4.9 5.9 3 12.5V18a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.5l-1.9-6.6A2 2 0 0 0 17.2 4.5H6.8a2 2 0 0 0-1.9 1.4Z" />
    </>
  ),
  // Clipboard with lines.
  auditLog: (
    <>
      <rect x="8.5" y="2.75" width="7" height="3.5" rx="1" />
      <path d="M9 4.5H7a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6.5a2 2 0 0 0-2-2h-2" />
      <path d="M8.75 11h6.5M8.75 14.5h4" />
    </>
  ),
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9.5 7V5.5A1.5 1.5 0 0 1 11 4h2a1.5 1.5 0 0 1 1.5 1.5V7" />
      <path d="M6.5 7l.9 12.1A1.5 1.5 0 0 0 8.9 20.5h6.2a1.5 1.5 0 0 0 1.5-1.4L17.5 7" />
      <path d="M10.5 11v5.5M13.5 11v5.5" />
    </>
  ),
  spinner: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M20.5 12a8.5 8.5 0 0 0-8.5-8.5" />
    </>
  ),
  check: <path d="m5 12.5 4.5 4.5L19 7" />,
  chevron: <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />,
};

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={className}
    >
      {GLYPHS[name]}
    </svg>
  );
}
