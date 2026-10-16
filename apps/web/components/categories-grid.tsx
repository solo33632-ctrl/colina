import { getTranslations } from 'next-intl/server';
import type { MachineCategory } from '@colina/db';
import { Container } from '@colina/ui';
import { CategoryCard } from './category-card';
import { Reveal } from './reveal';

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
        <Reveal className="delay-75" waitForIntro>
          {/* Heading only. The subheading line that used to sit under it went
              with the reference's own layout: the tiles are the content, and a
              sentence above them says nothing the grid does not. The key stays
              in the message files because /categories still uses it as its meta
              description. */}
          <h2
            id="categories-heading"
            className="text-center text-3xl font-bold text-stone-900 sm:text-4xl"
          >
            {t('heading')}
          </h2>
          {categories.length === 0 ? (
            <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
          ) : (
            // Constrained and centred so the square tiles land around 370px on
            // desktop rather than stretching the full container width.
            <ul className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((category) => (
                <li key={category.id}>
                  <CategoryCard category={category} locale={locale} />
                </li>
              ))}
            </ul>
          )}
        </Reveal>
      </Container>
    </section>
  );
}
