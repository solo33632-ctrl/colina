import type { Metadata } from 'next';
import { IBM_Plex_Sans, IBM_Plex_Sans_Arabic } from 'next/font/google';
import { cookies, headers } from 'next/headers';
import type { ReactNode } from 'react';
import { hasLocale, NextIntlClientProvider } from 'next-intl';
import {
  getMessages,
  getTranslations,
  setRequestLocale,
} from 'next-intl/server';
import { notFound, redirect } from 'next/navigation';
import { AdminAppShell } from '@/components/app-shell';
import { routing } from '@/i18n/routing';
import { getVerifiedAdminSession } from '@/lib/admin-action';
import { isPublicAuthPath } from '@/lib/public-routes';
import { parseTheme, themeAttribute, THEME_COOKIE } from '@/lib/theme';
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

  // Stage 2b: a JWT that still verifies is not enough to render an admin
  // page — the token's sessionVersion and role must match the AdminUser row
  // (checked once per request; `getVerifiedAdminSession` is cached). The
  // proxy carries the pathname so the public auth screens are exempt.
  // A revoked/expired-account token lands on that locale's login exactly
  // like a session-less request.
  const pathname = (await headers()).get('x-admin-pathname');
  if (pathname && !isPublicAuthPath(pathname)) {
    const session = await getVerifiedAdminSession();
    if (!session) {
      redirect(
        `/${locale}/login?callbackUrl=${encodeURIComponent(pathname)}`
      );
    }
  }

  const messages = await getMessages();
  // Direction is driven by the active locale — never hardcoded.
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  // Read the explicit choice on the server so the first byte of HTML already
  // carries the right theme. No cookie means "system": `data-theme` is omitted
  // and the prefers-color-scheme media query in globals.css decides.
  const theme = parseTheme((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html
      lang={locale}
      dir={direction}
      data-theme={themeAttribute(theme)}
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
          <AdminAppShell theme={theme}>{children}</AdminAppShell>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
