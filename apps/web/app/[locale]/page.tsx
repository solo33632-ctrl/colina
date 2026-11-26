import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import {
  CategoriesGrid,
  HOME_CATEGORY_LIMIT,
} from '@/components/categories-grid';
import { ContactCtaBand } from '@/components/contact-cta-band';
import { DeferredIntroOverlay } from '@/components/deferred-intro-overlay';
import { HeroSection } from '@/components/hero-section';
import { IntroProvider } from '@/components/intro-provider';
import { JsonLd } from '@/components/json-ld';
import {
  HOME_MAINTENANCE_LIMIT,
  MaintenanceCategories,
} from '@/components/maintenance-categories';
import { PageViewTracker } from '@/components/page-view-tracker';
import { PartnersStrip } from '@/components/partners-strip';
import { WhyUsSection } from '@/components/why-us-section';
import { PUBLIC_CATEGORY_WHERE } from '@/lib/public-content';
import { routing } from '@/i18n/routing';
import { getMaintenanceLines } from '@/lib/maintenance';
import { buildPageMetadata, getBaseUrl, localeAlternates } from '@/lib/seo';
import { getSiteSettings } from '@/lib/site-settings';

type Props = {
  params: Promise<{ locale: string }>;
};

// Interim freshness: revalidate DB-driven content hourly. Full on-demand
// revalidation (revalidatePath/Tag from admin writes) lands in Phase 9-12.
export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Hero' });
  const site = await getTranslations({ locale, namespace: 'Site' });
  return buildPageMetadata({
    locale,
    href: '/',
    title: t('title'),
    description: t('subtitle'),
    siteName: site('name'),
  });
}

export default async function HomePage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  // Read-only content queries in a Server Component — no API route needed.
  // (Phase 8's backend API covers form submissions/writes, not reads.)
  const [categories, partners, maintenanceLines, settings] = await Promise.all([
    // One extra row beyond the six the section prints, so the component can
    // tell whether a "View all" link is needed without a second query.
    prisma.machineCategory.findMany({
      where: PUBLIC_CATEGORY_WHERE,
      orderBy: { createdAt: 'asc' },
      take: HOME_CATEGORY_LIMIT + 1,
    }),
    prisma.partner.findMany({ orderBy: { createdAt: 'asc' } }),
    // Production lines with at least one machine, in the admin's order. Same
    // limit+1 rule as the product categories above.
    getMaintenanceLines(HOME_MAINTENANCE_LIMIT + 1),
    // Same cached read as the locale layout: one settings query per request.
    getSiteSettings(),
  ]);

  // Organization + WebSite structured data. The logo is the real site logo;
  // a contact point is emitted only when the settings row actually holds a
  // phone or email. No address, rating or founding date is invented.
  const site = await getTranslations('Site');
  const alternates = await localeAlternates('/', locale);
  const base = getBaseUrl();
  const contactPoint =
    settings.contactPhone || settings.contactEmail
      ? {
          '@type': 'ContactPoint',
          ...(settings.contactPhone
            ? { telephone: settings.contactPhone }
            : {}),
          ...(settings.contactEmail ? { email: settings.contactEmail } : {}),
        }
      : null;
  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site('name'),
    url: base,
    logo: `${base}/logo.png`,
    ...(contactPoint ? { contactPoint } : {}),
  };
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: site('name'),
    url: alternates.canonical,
    inLanguage: locale,
  };

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <PageViewTracker path="/" locale={locale} />
      <JsonLd data={organizationJsonLd} />
      <JsonLd data={websiteJsonLd} />
      {/* The brand moment and the reveal below it are scoped to the home page
          only: a deep link never mounts this, so a visitor arriving on a
          machine page from a search never sees a splash. */}
      <IntroProvider>
        <DeferredIntroOverlay />
        <HeroSection locale={locale} />
        <CategoriesGrid categories={categories} locale={locale} />
        <MaintenanceCategories lines={maintenanceLines} locale={locale} />
      </IntroProvider>
      <WhyUsSection />
      <PartnersStrip partners={partners} locale={locale} />
      <ContactCtaBand locale={locale} />
    </main>
  );
}
