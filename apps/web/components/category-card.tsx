import type { MachineCategory } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

export type CategoryCardProps = {
  category: MachineCategory;
  locale: 'ar' | 'en';
  /**
   * Pre-formatted machine count, e.g. "4 machines". Passed in rather than
   * translated here so the card stays a plain synchronous component — only the
   * two sections that list categories should pay for `getTranslations`.
   * Absent on the home grid, which does not carry counts.
   */
  countLabel?: string;
};

/**
 * One product category: its photo as the card's visual, the name and a short
 * description below, and how many machines sit behind it.
 *
 * The name sits *below* the image rather than over it. A category photo is
 * admin-supplied and most categories do not have one yet, and a title laid
 * over an image needs a scrim to stay legible — a scrim that then has nothing
 * to sit on when the image is missing. Below the image the name is always
 * legible whatever the photo situation, and the card still reads image-forward
 * once the photos arrive.
 *
 * Only `transform`, `box-shadow` and `border-color` move on hover, all
 * composited, so a grid of these stays cheap to scroll.
 */
export function CategoryCard({
  category,
  locale,
  countLabel,
}: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;
  const description =
    locale === 'ar' ? category.descriptionAr : category.descriptionEn;

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group block h-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transform-none motion-reduce:transition-none"
    >
      {/* The category's own photo. `aspect-[4/3]` is a deliberate crop of the
          card's face; unlike a logo (see PartnerCard), a photograph of
          machinery has no shape worth preserving, so cover is right here. */}
      <div className="relative overflow-hidden bg-brand-50">
        <ImageWithFallback
          src={category.image}
          alt={name}
          fallbackClassName="bg-brand-50"
          className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
        />
        {countLabel ? (
          <span className="absolute bottom-3 start-3 rounded-full bg-brand-700/90 px-3 py-1 text-xs font-medium text-white">
            {countLabel}
          </span>
        ) : null}
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-stone-900 transition-colors group-hover:text-brand-800">
          {name}
        </h3>
        <p className="mt-1 line-clamp-2 text-sm text-stone-600">
          {description}
        </p>
      </div>
    </Link>
  );
}
