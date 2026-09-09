import type { MachineCategory } from '@colina/db';
import { Card } from '@colina/ui';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

export type CategoryCardProps = {
  category: MachineCategory;
  locale: 'ar' | 'en';
};

// Shared by the home grid and the categories listing page.
export function CategoryCard({ category, locale }: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;
  const description =
    locale === 'ar' ? category.descriptionAr : category.descriptionEn;

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="block h-full rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <Card className="h-full overflow-hidden p-0">
        <ImageWithFallback src={category.image} alt={name} />
        <div className="p-6 text-start">
          <h3 className="text-lg font-semibold text-stone-900">{name}</h3>
          <p className="mt-1 text-sm text-stone-600">{description}</p>
        </div>
      </Card>
    </Link>
  );
}
