import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
import { CategoryCard } from '@/components/category-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { routing } from '@/i18n/routing';
import { getMaintenanceLines } from '@/lib/maintenance';
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
  const t = await getTranslations({ locale, namespace: 'MaintenanceShowcase' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/maintenance', locale),
  };
}

export default async function MaintenanceIndexPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('MaintenanceShowcase');
  const pages = await getTranslations('MaintenancePages');
  const nav = await getTranslations('Nav');
  const lines = await getMaintenanceLines();

  return (
    <main>
      <PageViewTracker path="/maintenance" locale={locale} />
      <Container className="py-16">
        <Breadcrumb
          label={pages('breadcrumbLabel')}
          items={[
            { label: nav('home'), href: '/' },
            { label: pages('maintenanceCrumb') },
          ]}
        />
        <h1 className="mt-10 text-center text-3xl font-bold text-stone-900 sm:text-4xl">
          {t('heading')}
        </h1>
        {/* The same hairline as the catalogue index, so the two listings read
            as siblings. Purely decorative. */}
        <div
          aria-hidden="true"
          className="mx-auto mt-6 h-0.5 w-16 rounded-full bg-brand-500"
        />
        {lines.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">
            {pages('indexEmpty')}
          </p>
        ) : (
          <ul className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {lines.map((line) => (
              <li key={line.id}>
                <CategoryCard
                  category={{
                    slug: line.slug,
                    nameEn: line.nameEn,
                    nameAr: line.nameAr,
                    image: line.coverImage,
                  }}
                  href={`/maintenance/${line.slug}`}
                  countLabel={pages('machineCount', { count: line.itemCount })}
                  locale={locale}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
