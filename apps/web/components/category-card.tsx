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
 * The outline a box icon for a category with no photo yet. Decorative: the
 * whole tile is one link whose accessible name is the category name, so the
 * icon carries no information a screen reader needs.
 */
function PlaceholderIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-10 w-10 text-stone-400"
    >
      <path d="M24 5 6 14v20l18 9 18-9V14L24 5Z" />
      <path d="M6 14l18 9 18-9" />
      <path d="M24 23v20" />
    </svg>
  );
}

/**
 * One product category: a complete photo on a neutral plate, and a solid brand
 * band underneath that always names the category.
 *
 * The reference this borrows from is one idea only — the category name is
 * legible on the tile itself rather than being something you have to click
 * through to learn. Everything else is built for that goal:
 *
 * - The name sits on an opaque `bg-brand-900` band, never over the photo. A
 *   category photo is admin-supplied, most categories do not have one yet, and
 *   text over an image needs a scrim that then has nothing to sit on when the
 *   image is missing. Below the photo the name reads the same in both locales,
 *   with or without a picture, and there is no contrast problem either way.
 * - The band is solid for every tile, so the name is *always* visible — a
 *   missing photo can never take the label with it.
 *
 * The photo is shown COMPLETE, never cropped. Two things make that true
 * rather than merely intended:
 *
 * - The wrapper owns the frame: `aspect-[4/3]` plus padding, on an element that
 *   is not the image. `ImageWithFallback` only applies `aspect-video` itself in
 *   its default `cover` mode, so a ratio asked of the image directly would put
 *   two `aspect-ratio` declarations on one element, resolved by stylesheet
 *   order rather than by intent — which is exactly how the 4:3 these cards ask
 *   for used to lose to the 16:9 default and every tile quietly took a shape it
 *   never claimed. Here the image is `fit="contain"`, which sets neither, and
 *   is padded inside the wrapper so the artwork never touches an edge.
 * - `renderFallback={false}`, plus a drawn placeholder icon for the no-photo
 *   case. A category tile whose photo 404s (seed rows carry placeholder paths)
 *   shows the neutral plate, never a broken-image glyph — and the component's
 *   own initial-letter tile is suppressed because a single letter is not a
 *   picture of a product line.
 *
 * Equal heights: the name is `line-clamp-2` with a two-line minimum reserved,
 * so a one-line name and a two-line name produce the same tile and the band
 * keeps its place in the row.
 *
 * Hover: the card lifts and its shadow deepens; the arrow slides toward the
 * text end. The movement is gated with `motion-safe:` rather than cancelled
 * with `motion-reduce:transform-none`. Cancelling does not work: Tailwind emits
 * the hover rule as `.hover\:-translate-y-1:hover`, two class selectors, against
 * the single-selector `.motion-reduce\:transform-none`, so under
 * `prefers-reduced-motion: reduce` both match and the higher-specificity hover
 * rule wins — the lift survives the preference. `motion-safe:` wraps the hover
 * rule itself in `(prefers-reduced-motion: no-preference)`, so a visitor who
 * asked for less motion is never given a rule to override. Colour and shadow
 * transitions stay ungated: they are not movement.
 */
export function CategoryCard({
  category,
  locale,
  countLabel,
}: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;

  return (
    <Link
      href={`/categories/${category.slug}`}
      // The tile's accessible name is the category name and nothing else, so a
      // screen reader announces "Production Lines, link" rather than reading
      // the count and the arrow out too. The visible text repeats it below.
      aria-label={name}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {/* The wrapper owns the frame and the padding; the image inside it is
          `contain` and padded, so the photo is complete and never touches an
          edge. The gradient is what shows while the photo loads, and what is
          left when there is none. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-stone-50 to-stone-100 p-3 sm:p-4">
        {category.image ? (
          <ImageWithFallback
            src={category.image}
            alt=""
            fit="contain"
            renderFallback={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <PlaceholderIcon />
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col bg-brand-900 px-4 py-3.5 text-white sm:px-5 sm:py-4">
        {/* Two lines are reserved whether or not the name needs them, so every
            band in a row is the same height. */}
        <h3 className="line-clamp-2 min-h-[2.5rem] font-semibold leading-5 sm:min-h-[2.75rem] sm:text-lg">
          {name}
        </h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-2">
          {countLabel ? (
            <span aria-hidden="true" className="min-w-0 text-xs text-brand-200">
              {countLabel}
            </span>
          ) : (
            <span aria-hidden="true" />
          )}
          {/* `end` follows the writing direction, and `rtl:rotate-180` flips
              the glyph so it points the way the visitor is reading in both
              locales. Nudges on hover, gated as above. */}
          <span
            aria-hidden="true"
            className="shrink-0 text-brand-200 transition-transform duration-300 motion-safe:group-hover:translate-x-1 rtl:rotate-180 rtl:motion-safe:group-hover:-translate-x-1"
          >
            <svg
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M4 10h11" />
              <path d="m11 6 4 4-4 4" />
            </svg>
          </span>
        </div>
      </div>
    </Link>
  );
}
