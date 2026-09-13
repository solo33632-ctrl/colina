import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { CategoriesGrid } from '@/components/categories-grid';
import { ContactSection } from '@/components/contact-section';
import { HeroSection } from '@/components/hero-section';
import { PartnersStrip } from '@/components/partners-strip';
import { WhyUsSection } from '@/components/why-us-section';
import { routing } from '@/i18n/routing';
import { localeAlternates, serializeJsonLd } from '@/lib/seo';

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
  const [categories, partners] = await Promise.all([
    prisma.machineCategory.findMany({ orderBy: { createdAt: 'asc' } }),
    prisma.partner.findMany({ orderBy: { createdAt: 'asc' } }),
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: organizationJsonLd }}
      />
      <HeroSection />
      <CategoriesGrid categories={categories} locale={locale} />
      <WhyUsSection />
      <PartnersStrip partners={partners} locale={locale} />
      <ContactSection />
    </main>
  );
}
