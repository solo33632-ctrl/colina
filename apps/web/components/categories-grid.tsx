import { getTranslations } from 'next-intl/server';
import type { MachineCategory } from '@colina/db';
import { Card, Container } from '@colina/ui';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

type CategoriesGridProps = {
  categories: MachineCategory[];
  locale: 'ar' | 'en';
};

// Category cards link to `/categories/[slug]` — that route lands in
// Phase 5, so the links 404 until then (expected, see Phase 4 summary).
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
            {categories.map((category) => {
              const name = locale === 'ar' ? category.nameAr : category.nameEn;
              const description =
                locale === 'ar'
                  ? category.descriptionAr
                  : category.descriptionEn;
              return (
                <li key={category.id}>
                  <Link
                    href={`/categories/${category.slug}`}
                    className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <Card className="h-full overflow-hidden p-0">
                      <ImageWithFallback src={category.image} alt={name} />
                      <div className="p-6 text-start">
                        <h3 className="text-lg font-semibold text-stone-900">
                          {name}
                        </h3>
                        <p className="mt-1 text-sm text-stone-600">
                          {description}
                        </p>
                      </div>
                    </Card>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
    </section>
  );
}
