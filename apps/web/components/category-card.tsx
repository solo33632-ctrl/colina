import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

/**
 * The fields a tile prints. `MachineCategory` satisfies this shape, and so
 * does a maintenance line mapped to `{ slug, nameEn, nameAr, image }` — the
 * two grids are deliberately the same card.
 */
export type CategoryCardCategory = {
  slug: string;
  nameEn: string;
  nameAr: string;
  image: string | null;
};

export type CategoryCardProps = {
  category: CategoryCardCategory;
  locale: 'ar' | 'en';
  /**
   * Where the tile links. Defaults to the product-category page; the
   * maintenance grid passes `/maintenance/[slug]` so it can share this tile
   * instead of growing a near-copy with its own hover rules.
   */
  href?: string;
  /**
   * Optional pill under the name, e.g. "12 machines". Rendered inside the
   * tile and folded into the link's accessible name, so a screen reader hears
   * the count as part of the destination rather than as loose text.
   */
  countLabel?: string;
  /**
   * The one line revealed under the name on hover/focus. Required so no call
   * site can inherit the wrong grid's copy: the product categories and the
   * maintenance lines say different things about where the tile goes.
   */
  hoverText: string;
  /** The outlined pill's label, "View" / "عرض". */
  viewLabel: string;
};

/**
 * One category, as a square tile: the photo fills the tile, a dark overlay
 * sits over it, and the category name is centred on top in white.
 *
 * THE PHOTO IS ALWAYS SHOWN COMPLETE, never cropped. A production-line photo
 * cropped to a square loses the machine it exists to show, so this rule
 * outranks the reference:
 *
 * - The LINK owns the ratio (`aspect-square`) and the image is a `h-full w-full`
 *   layer inside a padded `absolute inset-0` wrapper. As in the machine card the
 *   ratio never goes on the image itself: `ImageWithFallback` only applies
 *   `aspect-video` in its default `cover` mode, so asking it for a ratio too
 *   would put two `aspect-ratio` declarations on one element and leave
 *   stylesheet order to decide which wins.
 * - `fit="contain"` letterboxes the photo inside that padded box, so the
 *   artwork is whole whatever its proportions and never touches a tile edge.
 * - `renderFallback={false}`: a photo that 404s shows the white tile through
 *   the scrim rather than a broken-image glyph or a stray initial letter.
 *
 * A category with no photo gets the same square with a solid dark field instead
 * of photo + scrim, so the grid reads as one set: same shape, same name in the
 * same place. A missing photo cannot make a tile look unfinished.
 *
 * HOVER REVEAL. At rest the tile is exactly what it was: photo, scrim, centred
 * name (and count). Pointing at it — or tabbing to it — darkens the scrim,
 * lifts the name, and reveals a short line of copy plus an outlined "View"
 * pill with an arrow. The reveal is absolutely positioned under the name
 * block, so it takes no space at rest and the name stays dead centre until
 * the state changes. The name block's upward shift and the tile's lift are
 * both transforms and are gated with `motion-safe:`; a visitor who asked for
 * reduced motion gets the same state change with no movement.
 *
 * The reveal only exists where the device can actually hover
 * (`@media (hover: hover)`), so a tap on a phone cannot leave a stuck hover
 * state behind; on touch the tile stays at rest and the tap navigates.
 * Keyboard focus still reveals it everywhere, because that is not a hover.
 *
 * The whole tile is ONE link. The revealed copy and pill are a styled,
 * `aria-hidden` span, never nested controls, and the link's accessible name
 * remains the category name (plus the count when there is one).
 *
 * Typography. The name is `font-medium` (500): IBM Plex Sans and IBM Plex Sans
 * Arabic both load 400/500/600/700 (see `app/[locale]/layout.tsx`), so 500 is a
 * weight the files genuinely ship — not a synthesised one — and it is the
 * lightest that still holds its shape over a scrim at this size. 700 is too
 * heavy for a name repeated nine times down a page; 400 is legible but thin
 * against a photograph. `max-w-[80%]` plus `text-balance` keeps a long name
 * wrapping evenly instead of leaving a short orphan line, and `line-clamp-2`
 * bounds it to two lines so every tile is the same height and a long name can
 * never push its neighbours out of line.
 *
 * The lift cannot widen the page: the tile is `overflow-hidden` and the
 * transform is vertical only, so a neighbouring tile's shadow is the only
 * thing that ever reaches past a cell edge.
 */
export function CategoryCard({
  category,
  locale,
  href,
  countLabel,
  hoverText,
  viewLabel,
}: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;

  return (
    <Link
      href={href ?? `/categories/${category.slug}`}
      // The tile's accessible name is the category name — plus the count when
      // one is shown — and nothing else, so a screen reader announces
      // "Production Lines, 12 machines, link" rather than the photo, the
      // scrim and the hidden hover copy as well.
      aria-label={countLabel ? `${name} — ${countLabel}` : name}
      className="group relative block aspect-square cursor-pointer overflow-hidden rounded-lg bg-white transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-2 motion-safe:group-focus-visible:-translate-y-2 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {category.image ? (
        <>
          {/* The tile owns the ratio; this layer only pads the photo off the
              edges, and the image inside is `contain`, so it is always whole.
              The zoom is on the image, inside the padded box, so it grows
              towards the middle rather than out past the tile edge. */}
          <div className="absolute inset-0 overflow-hidden p-2">
            <ImageWithFallback
              src={category.image}
              alt=""
              fit="contain"
              className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-105"
              renderFallback={false}
            />
          </div>
          {/* The scrim. Present whatever the photo's own brightness, which is
              what lets one white name work over every category. It darkens on
              hover/focus instead of lightening: the revealed copy sits on the
              same photo, so the state that shows more text must not reduce the
              contrast under it. */}
          <div
            aria-hidden="true"
            data-testid="category-card-overlay"
            className="absolute inset-0 bg-black/60 transition-colors duration-300 [@media(hover:hover)]:group-hover:bg-black/70 group-focus-visible:bg-black/70"
          />
        </>
      ) : (
        // No photo: a solid field in the same place the photo + scrim would
        // have occupied, so the tile is identical in layout. It darkens on
        // hover/focus like the scrim does.
        <div
          aria-hidden="true"
          data-testid="category-card-overlay"
          className="absolute inset-0 bg-stone-800 transition-colors duration-300 [@media(hover:hover)]:group-hover:bg-stone-900 group-focus-visible:bg-stone-900"
        />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
        <div className="relative flex max-w-[80%] flex-col items-center motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out [@media(hover:hover)]:motion-safe:group-hover:-translate-y-5 motion-safe:group-focus-visible:-translate-y-5">
          <h3 className="line-clamp-2 text-balance font-medium text-lg leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] sm:text-xl">
            {name}
          </h3>
          {countLabel ? (
            <span className="mt-2 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {countLabel}
            </span>
          ) : null}
          {/* The reveal, out of flow under the name block. Absolute so the
              resting tile is laid out exactly as before; `w-60 max-w-full`
              keeps it inside the narrowest tile while staying readable on a
              wide one. Opacity is a colour change and may transition without
              a motion gate; nothing here moves unless motion is safe. */}
          <div
            aria-hidden="true"
            data-testid="category-card-reveal"
            className="pointer-events-none absolute inset-x-0 top-full mx-auto mt-2.5 flex w-60 max-w-full flex-col items-center opacity-0 transition-opacity duration-300 [@media(hover:hover)]:group-hover:opacity-100 group-focus-visible:opacity-100"
          >
            <p className="line-clamp-2 text-balance text-xs leading-snug text-white sm:text-sm">
              {hoverText}
            </p>
            <span
              data-testid="category-card-view"
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-full border border-white px-3 py-1 text-xs font-medium text-white sm:text-sm"
            >
              {viewLabel}
              {/* Drawn pointing right, mirrored under `dir="rtl"` so "forward"
                  follows the reading direction in both locales. */}
              <svg
                aria-hidden="true"
                focusable="false"
                data-testid="category-card-arrow"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5 shrink-0 rtl:[transform:scaleX(-1)]"
              >
                <path d="M4 12h15" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
