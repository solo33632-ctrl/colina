import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { CategoryCard } from '@/components/category-card';
import { PageViewTracker } from '@/components/page-view-tracker';
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
  const t = await getTranslations({ locale, namespace: 'Categories' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/categories', locale),
  };
}

export default async function CategoriesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('Categories');
  const categories = await prisma.machineCategory.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <PageViewTracker path="/categories" locale={locale} />
      <Container className="py-16">
        <h1 className="text-center text-3xl font-bold text-stone-900 sm:text-4xl">
          {t('heading')}
        </h1>
        {/* No subheading paragraph here either — same reason as the home grid.
            The key is still used above as this page's meta description. */}
        {/* A hairline in the brand orange, echoing the rule under the hero and
            the partners strip. Purely decorative. */}
        <div
          aria-hidden="true"
          className="mx-auto mt-6 h-0.5 w-16 rounded-full bg-brand-500"
        />
        {categories.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : (
          <ul className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.id}>
                <CategoryCard
                  category={category}
                  locale={locale}
                  hoverText={t('hoverText')}
                  viewLabel={t('viewLabel')}
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
