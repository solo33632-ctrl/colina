import type { ReactNode } from 'react';

// Root layout is an intentional pass-through: with a `[locale]` dynamic
// segment in the tree, Next.js lets `app/[locale]/layout.tsx` own the
// <html>/<body> shell (this is next-intl's documented structure — the
// document element has to be rendered inside the segment so it can carry
// the locale-specific lang/dir). Same as apps/web.
export default function RootLayout({ children }: { children: ReactNode }) {
  return children;
}
