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
import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';
import { WhatsappButton } from '@/components/whatsapp-button';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';
import { getSiteSettings } from '@/lib/site-settings';
import { buildWhatsappUrl } from '@/lib/whatsapp';
import '../globals.css';

// Arabic UI face: full Arabic coverage, 100–700 weights, engineered for
// UI legibility; pairs metrically with IBM Plex Sans (Latin) below.
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

type LocaleParams = {
  children: ReactNode;
  params: Promise<{ locale: string }>;
};

// The locale shell now reads the WhatsApp settings from the database, so every
// page under it is DB-driven. Hourly ISR is the same freshness window the rest
// of the public site uses (see agent.md) and keeps every page statically
// generated — nothing here becomes a per-request dynamic render.
export const revalidate = 3600;

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
    alternates: await localeAlternates('/', locale),
  };
}

export default async function LocaleLayout({ children, params }: LocaleParams) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Distribute the locale to next-intl so Server Components can render
  // statically instead of falling back to `headers()`.
  setRequestLocale(locale);

  const messages = await getMessages();
  // Direction is driven by the active locale — never hardcoded.
  const direction = locale === 'ar' ? 'rtl' : 'ltr';

  // One settings read for the whole request tree (the contact page asks for
  // the same cached value). The locale's stored greeting wins; a blank or
  // missing one falls back to the standard greeting in the messages file.
  const whatsapp = await getTranslations('Whatsapp');
  const settings = await getSiteSettings();
  const storedMessage =
    locale === 'ar' ? settings.whatsappMessageAr : settings.whatsappMessageEn;
  const whatsappHref = settings.whatsappNumber
    ? buildWhatsappUrl(
        settings.whatsappNumber,
        storedMessage?.trim() || whatsapp('defaultMessage')
      )
    : null;

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
          <SiteHeader />
          {children}
          <SiteFooter hasWhatsapp={whatsappHref !== null} />
          {whatsappHref ? (
            <WhatsappButton
              href={whatsappHref}
              label={whatsapp('buttonLabel')}
            />
          ) : null}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
