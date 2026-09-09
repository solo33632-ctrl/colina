import type { ReactNode } from 'react';

// Root layout stays minimal: locale, direction, fonts and the document
// shell live in `app/[locale]/layout.tsx` (official next-intl pattern).
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
