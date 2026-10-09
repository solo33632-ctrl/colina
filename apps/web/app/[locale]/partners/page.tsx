import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { PageViewTracker } from '@/components/page-view-tracker';
import { PartnersStrip } from '@/components/partners-strip';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'PartnersPage' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/partners', locale),
  };
}

export default async function PartnersPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const partners = await prisma.partner.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <PageViewTracker path="/partners" locale={locale} />
      {/* The same section as the home strip, so the listing page and the home
          page cannot drift apart. This one is the page's `h1` and keeps its
          own message namespace. */}
      <PartnersStrip
        partners={partners}
        locale={locale}
        namespace="PartnersPage"
        headingLevel="h1"
      />
    </main>
  );
}
