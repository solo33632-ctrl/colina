import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { CategoryCard } from '@/components/category-card';
import { routing } from '@/i18n/routing';

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
      <Container className="py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        {categories.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {categories.map((category) => (
              <li key={category.id}>
                <CategoryCard category={category} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
