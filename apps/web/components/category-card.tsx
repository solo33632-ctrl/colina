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
 * One product category: a photo that fills the card's face, and a white label
 * area below carrying the name, a short description and the machine count.
 *
 * The frame is a fixed `aspect-[4/3]` box owned by the wrapper, and the photo
 * is `h-full w-full object-cover` inside it. The ratio deliberately does not
 * live on `ImageWithFallback`: in its default `cover` mode that component
 * applies `aspect-video` itself, and when a caller also asks for a ratio the
 * two `aspect-ratio` declarations are resolved by stylesheet order rather than
 * by intent — the 4:3 these cards asked for was silently losing to the 16:9
 * default, so every tile in the grid was the shape it never claimed to be.
 * Pinning both dimensions on the image settles it instead, because a box with
 * a definite width *and* height ignores `aspect-ratio` altogether. Either
 * way the photo reaches all four edges whatever its own proportions are, and
 * a row of tiles lines up exactly.
 *
 * The wrapper's grey is what shows while the photo is still loading. The
 * letter tile is left on the component's own default peach rather than being
 * recoloured through `fallbackClassName`: that would put a second `bg-*`
 * declaration on the same element, and which one survives is decided by
 * stylesheet order, not by which was written last.
 *
 * Nothing is stamped over the photo. The name and the count sit below it in a
 * clean area: a category photo is admin-supplied and most categories do not
 * have one yet, a title laid over an image needs a scrim to stay legible, and
 * that scrim then has nothing to sit on when the image is missing. Below the
 * image the name reads the same in both locales, with or without a photo, and
 * there is no contrast problem to solve in either direction.
 *
 * The count keeps its `rounded-full` pill but moves out of the photo and into
 * the label row, where it belongs to the text rather than to the picture.
 *
 * Hover: the photo scales up inside the frame, the card lifts, its border
 * takes the brand orange and an accent bar grows under the name — the signal
 * that this is a link, which a photo alone does not give. The bar grows from
 * its centre, so it reads identically in RTL and LTR. Only `transform`,
 * `box-shadow` and `border-color` move, all composited, so a grid of these
 * stays cheap to scroll.
 *
 * The movement is gated with `motion-safe:` rather than cancelled with
 * `motion-reduce:transform-none`. Cancelling does not work here: Tailwind
 * emits the hover rule as `.hover\:-translate-y-1:hover`, two class selectors,
 * against `.motion-reduce\:transform-none`'s one, so under
 * `prefers-reduced-motion: reduce` both rules match and the higher-specificity
 * hover rule wins — the lift and the zoom both survive the preference.
 * `motion-safe:` puts the hover rule itself inside
 * `(prefers-reduced-motion: no-preference)`, so a visitor who asked for less
 * motion never gets a rule to override. The colour and shadow transitions stay
 * ungated: they are not movement.
 */
export function CategoryCard({
  category,
  locale,
  countLabel,
}: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;
  const description = (
    locale === 'ar' ? category.descriptionAr : category.descriptionEn
  ).trim();

  return (
    <Link
      href={`/categories/${category.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:border-brand-500 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <ImageWithFallback
          src={category.image}
          alt={name}
          className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-stone-900 transition-colors group-hover:text-brand-800">
            {name}
          </h3>
          {countLabel ? (
            <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-1 text-xs font-medium text-brand-800">
              {countLabel}
            </span>
          ) : null}
        </div>
        <div
          aria-hidden="true"
          className="mt-2.5 h-0.5 w-10 scale-x-0 rounded-full bg-brand-500 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-x-100"
        />
        {description ? (
          <p className="mt-2.5 line-clamp-2 text-sm text-stone-600">
            {description}
          </p>
        ) : null}
      </div>
    </Link>
  );
}
