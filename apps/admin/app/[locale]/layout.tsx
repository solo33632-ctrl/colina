import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
import type { ReactNode } from 'react';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { notFound } from 'next/navigation';
import { AdminFooter } from '@/components/footer';
import { AdminHeader } from '@/components/header';
import { routing } from '@/i18n/routing';
import '../globals.css';

// Arabic UI face: full Arabic coverage, pairs metrically with IBM Plex Sans
// (Latin) below. Same pairing as apps/web.
const arabic = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-arabic',
  display: 'swap',
});

const latin = IBM_Plex_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-latin',
  display: 'swap',
});

type LocaleLayoutParams = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Metadata' });
  return {
    title: t('title'),
    description: t('description'),
    // Internal tool: never indexed, never followed (agent.md). Set on the
    // locale layout so it covers every page below it.
    robots: { index: false, follow: false },
  };
}

export default async function AdminLocaleLayout({
  children,
  params,
}: LocaleLayoutParams) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Distribute the locale to next-intl so Server Components render statically
  // and Server Actions can resolve the admin's current language.
  setRequestLocale(locale);

  const messages = await getMessages();
  // Direction is driven by the active locale — never hardcoded.
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html
      lang={locale}
      dir={direction}
      className={`${arabic.variable} ${latin.variable}`}
    >
      <body
        className={
          locale === 'ar'
            ? 'bg-stone-50 font-arabic text-stone-900'
            : 'bg-stone-50 font-sans text-stone-900'
        }
      >
        <NextIntlClientProvider messages={messages}>
          <AdminHeader />
          {children}
          <AdminFooter />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
