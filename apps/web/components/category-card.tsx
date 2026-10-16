import type { MachineCategory } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

export type CategoryCardProps = {
  category: MachineCategory;
  locale: 'ar' | 'en';
};

/**
 * A line-drawn gear, our own drawing, standing in for "a family of production
 * machines". Drawn here rather than imported so the tile carries no asset: it
 * inherits `currentColor`, so it is white over the overlay and needs no second
 * variant for the no-photo tile.
 *
 * Decorative: the whole tile is one link whose accessible name is the category
 * name, so the icon conveys nothing a screen reader is missing.
 */
function CategoryIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-11 w-11 shrink-0 drop-shadow-[0_1px_2px_rgba(0,0,0,0.45)]"
    >
      <circle cx="12" cy="12" r="7.2" />
      <circle cx="12" cy="12" r="2.8" />
      <path d="M12 2.6v2.2M12 19.2v2.2M21.4 12h-2.2M4.8 12H2.6M18.6 5.4l-1.6 1.6M7 17l-1.6 1.6M18.6 18.6 17 17M7 7 5.4 5.4" />
    </svg>
  );
}

/**
 * One product category, as a square tile: the photo fills the tile, a dark
 * overlay sits over it, and the name is centred on top in white.
 *
 * The structure is borrowed from a reference catalogue's home grid — square
 * tiles, a scrim, the name dead centre, and nothing else — while every pixel is
 * ours: our icon, our photos, our palette.
 *
 * The photo is still shown COMPLETE, never cropped, which is the one rule that
 * outranks the reference here. A production-line photo cropped to a square loses
 * the machine it exists to show, so:
 *
 * - The LINK owns the ratio (`aspect-square`) and the image is a `h-full w-full`
 *   layer inside a padded `absolute inset-0` wrapper. As in the machine card,
 *   the ratio never goes on the image itself: `ImageWithFallback` only applies
 *   `aspect-video` in its default `cover` mode, so asking it for a ratio too
 *   would put two `aspect-ratio` declarations on one element and leave
 *   stylesheet order to decide which wins.
 * - `fit="contain"` letterboxes the photo inside that padded box, so the
 *   artwork is whole whatever its proportions and never touches a tile edge.
 * - `renderFallback={false}`: a photo that 404s shows the white tile through
 *   the scrim rather than a broken-image glyph or a stray initial letter.
 *
 * A category with no photo gets the same tile with a solid dark field instead
 * of photo + scrim, so the grid reads as one set: same square, same icon in the
 * same place, same name in the same place. A missing photo cannot make a tile
 * look unfinished.
 *
 * Legibility over the scrim: white on `bg-black/60` is about 8:1, comfortably
 * past WCAG AA for the bold name. The drop-shadow on the icon and the name is a
 * second line of defence for the case where a photo is bright right behind the
 * text, and `line-clamp-3` bounds the name to three lines so a long one cannot
 * push the icon out of the tile.
 *
 * Hover/focus lightens the scrim (`bg-black/60` → `bg-black/45`) — a colour and
 * opacity change, not movement, so it needs no `motion-safe:` gate and no
 * `motion-reduce:` cancellation. There is deliberately no scale or translate
 * here at all: a full-bleed photo lifted off the page reveals the tile edges,
 * which is the wrong signal for something that already fills its frame.
 */
export function CategoryCard({ category, locale }: CategoryCardProps) {
  const name = locale === 'ar' ? category.nameAr : category.nameEn;

  return (
    <Link
      href={`/categories/${category.slug}`}
      // The tile's accessible name is the category name and nothing else, so a
      // screen reader announces "Production Lines, link" rather than the icon
      // or the scrim as well.
      aria-label={name}
      className="group relative block aspect-square overflow-hidden rounded-lg bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {category.image ? (
        <>
          {/* The tile owns the ratio; this layer only pads the photo off the
              edges, and the image inside is `contain`, so it is always whole. */}
          <div className="absolute inset-0 p-2">
            <ImageWithFallback
              src={category.image}
              alt=""
              fit="contain"
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

      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-4 text-center text-white">
        <CategoryIcon />
        <h3 className="line-clamp-3 text-lg font-bold leading-snug drop-shadow-[0_1px_3px_rgba(0,0,0,0.5)] sm:text-xl">
          {name}
        </h3>
      </div>
    </Link>
  );
}
