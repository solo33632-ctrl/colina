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
};

/**
 * One product category, as a square tile: the photo fills the tile, a dark
 * overlay sits over it, and the category name is centred on top in white.
 *
 * The structure is borrowed from a reference catalogue's home grid — square
 * tiles, a scrim, the name dead centre — while every pixel is ours: our photos,
 * our palette, our copy. A previous version also put a line icon above the name;
 * it went, because the name alone is the one thing every visitor needs to read
 * and a glyph competes with it for the middle of a small square.
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
 * Centring is exact: the name is the only in-flow child, and the hover underline
 * is positioned out of flow (`absolute top-full`), so a tile that has never been
 * hovered is laid out exactly as one that has.
 *
 * Hover/focus says "this is a link" four ways at once — the tile lifts, the
 * shadow deepens, the photo eases in, the scrim lightens — plus an underline
 * bar under the name. The movement is gated with `motion-safe:` rather than
 * cancelled with `motion-reduce:`: Tailwind emits the hover rule as a
 * two-class selector (`.hover\:-translate-y-2:hover`) against `motion-reduce:`'s
 * single class, so under `prefers-reduced-motion: reduce` both rules match and
 * the higher-specificity hover rule wins — the lift would survive the very
 * preference it ignores. `motion-safe:` wraps the hover rule itself in
 * `(prefers-reduced-motion: no-preference)`, so a visitor who asked for less
 * motion is never given a rule to override. Opacity and colour changes are not
 * movement and stay ungated.
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
}: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;

  return (
    <Link
      href={href ?? `/categories/${category.slug}`}
      // The tile's accessible name is the category name — plus the count when
      // one is shown — and nothing else, so a screen reader announces
      // "Production Lines, 12 machines, link" rather than the photo and the
      // scrim as well.
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
              what lets one white name work over every category. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-black/60 transition-colors duration-300 group-hover:bg-black/45 group-focus-visible:bg-black/45"
          />
        </>
      ) : (
        // No photo: a solid field in the same place the photo + scrim would
        // have occupied, so the tile is identical in layout.
        <div aria-hidden="true" className="absolute inset-0 bg-stone-800" />
      )}

      <div className="absolute inset-0 flex flex-col items-center justify-center px-4 text-center text-white">
        <div className="relative flex max-w-[80%] flex-col items-center">
          <h3 className="line-clamp-2 text-balance font-medium text-lg leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] sm:text-xl">
            {name}
          </h3>
          {countLabel ? (
            <span className="mt-2 rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-medium text-white backdrop-blur-sm">
              {countLabel}
            </span>
          ) : null}
          {/* The hover underline, out of flow on purpose: in flow it would make
              the name sit above the tile's centre instead of on it, and a tile
              would only be truly centred once hovered. `-ml-5` centres it on the
              name without a translate transform. With a count pill present it
              sits under the pill, still out of flow. */}
          <span
            aria-hidden="true"
            className="absolute left-1/2 top-full -ml-5 mt-2 h-0.5 w-10 rounded-full bg-white opacity-0 transition-opacity duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          />
        </div>
      </div>
    </Link>
  );
}
