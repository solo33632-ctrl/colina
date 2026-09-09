import { getTranslations } from 'next-intl/server';
import type { MachineCategory } from '@colina/db';
import { Container } from '@colina/ui';
import { CategoryCard } from './category-card';

type CategoriesGridProps = {
  categories: MachineCategory[];
  locale: 'ar' | 'en';
};

export async function CategoriesGrid({
  categories,
  locale,
}: CategoriesGridProps) {
  const t = await getTranslations('Categories');

  return (
    <section aria-labelledby="categories-heading">
      <Container className="py-16">
        <h2
          id="categories-heading"
          className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
        >
          {t('heading')}
        </h2>
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
    </section>
  );
}
