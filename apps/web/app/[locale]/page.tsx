import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { CategoriesGrid } from '@/components/categories-grid';
import { ContactSection } from '@/components/contact-section';
import { HeroSection } from '@/components/hero-section';
import { IntroOverlay } from '@/components/intro-overlay';
import { IntroProvider } from '@/components/intro-provider';
import { MaintenanceShowcase } from '@/components/maintenance-showcase';
import { PageViewTracker } from '@/components/page-view-tracker';
import { PartnersStrip } from '@/components/partners-strip';
import { WhyUsSection } from '@/components/why-us-section';
import { routing } from '@/i18n/routing';
import { localeAlternates, serializeJsonLd } from '@/lib/seo';

type Props = {
  params: Promise<{ locale: string }>;
};

// Interim freshness: revalidate DB-driven content hourly. Full on-demand
// revalidation (revalidatePath/Tag from admin writes) lands in Phase 9-12.
// How many comparisons the home page renders. Six fills the `lg:grid-cols-3`
// grid as two clean rows, the same shape the categories section above already
// has. Local rather than shared: only this page reads it, unlike the limit it
// replaced, which the admin form also had to quote.
const MAINTENANCE_SHOWCASE_LIMIT = 6;

export const revalidate = 3600;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Hero' });
  return {
    title: t('title'),
    description: t('subtitle'),
    alternates: await localeAlternates('/', locale),
  };
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
  const [categories, partners, showcases] = await Promise.all([
    prisma.machineCategory.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.partner.findMany({ orderBy: { createdAt: 'asc' } }),
    // The before/after comparisons. Newest first — the most recent job is the
    // one a visitor is most likely to have come to see — and capped so the row
    // keeps the same shape as the categories grid above it. `nameEn` is the
    // tiebreaker for rows saved in the same millisecond.
    //
    // Only the five columns the card actually prints or hands to the slider:
    // the descriptions are admin-facing long form and no public page reads
    // them, and `createdAt` is not rendered either, only ordered by.
    prisma.maintenanceShowcase.findMany({
      orderBy: [{ createdAt: 'desc' }, { nameEn: 'asc' }],
      take: MAINTENANCE_SHOWCASE_LIMIT,
      select: {
        id: true,
        nameEn: true,
        nameAr: true,
        beforeImageUrl: true,
        afterImageUrl: true,
      },
    }),
  ]);

  // Organization structured data: name + canonical URL only. No logo file
  // or contact details exist yet (Phase 0) — omitted rather than faked.
  const site = await getTranslations('Site');
  const { canonical } = await localeAlternates('/', locale);
  const organizationJsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: site('name'),
    url: canonical,
  });

  return (
    <main>
      <PageViewTracker path="/" locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: organizationJsonLd }}
      />
      {/* The brand moment and the reveal below it are scoped to the home page
          only: a deep link never mounts this, so a visitor arriving on a
          machine page from a search never sees a splash. */}
      <IntroProvider>
        <IntroOverlay />
        <HeroSection />
        <CategoriesGrid categories={categories} locale={locale} />
        <MaintenanceShowcase showcases={showcases} locale={locale} />
      </IntroProvider>
      <WhyUsSection />
      <PartnersStrip partners={partners} locale={locale} />
      <ContactSection />
    </main>
  );
}
