import type { Metadata } from 'next';
import { IBM_Plex_Sans } from 'next/font/google';
import type { ReactNode } from 'react';
import { AdminFooter } from '@/components/footer';
import { AdminHeader } from '@/components/header';
import './globals.css';

// Latin face only: the admin panel is English-only in Phase 3.
// Add the Arabic face here if the admin UI becomes bilingual later.
const latin = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-latin',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Colina Admin',
  description: 'Colina internal admin panel placeholder.',
  robots: {
    index: false,
    follow: false,
  },
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={latin.variable}>
      <body className="bg-stone-50 font-sans text-stone-900">
        <AdminHeader />
        {children}
        <AdminFooter />
      </body>
    </html>
  );
}
