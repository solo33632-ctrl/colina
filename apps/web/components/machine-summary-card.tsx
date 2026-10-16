import type { Machine, MachineCategory, MachineImage } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

/**
 * A machine with enough to draw a card: identity, where it belongs, its short
 * summary, whether it is featured, and one photo.
 *
 * The parent category travels with it because the card prints it as a label
 * above the name. Every query that feeds a grid therefore selects `category`
 * alongside `images` — a card that had to fetch it could not stay a plain
 * synchronous component.
 */
export type MachineSummary = Pick<
  Machine,
  | 'id'
  | 'slug'
  | 'nameAr'
  | 'nameEn'
  | 'shortDescriptionAr'
  | 'shortDescriptionEn'
  | 'featured'
> & {
  images?: Pick<MachineImage, 'url'>[];
  category?: Pick<MachineCategory, 'nameAr' | 'nameEn'>;
};

/**
 * The card's two strings, resolved by the caller. Passed in rather than looked
 * up here so the card stays a plain synchronous component and one grid of
 * machines performs one translation lookup rather than one per card.
 */
export type MachineCardLabels = {
  viewDetails: string;
  featured: string;
};

export type MachineSummaryCardProps = {
  machine: MachineSummary;
  locale: 'ar' | 'en';
  labels: MachineCardLabels;
};

/**
 * The one machine card in the project.
 *
 * Every grid of machines renders this: the home page's featured strip, the
 * category page's machine grid, the catalogue listing and the related strip at
 * the foot of a machine page. An earlier version had a second, near-identical
 * card carrying the short description for the home page only; two cards for
 * one object is how a catalogue starts looking like it was assembled from two
 * different sites, so there is one.
 *
 * The image treatment is deliberately identical to `CategoryCard`: a wrapper
 * owning an `aspect-[4/3]` frame and its padding, the photo `contain` inside it
 * on a soft neutral plate, and the wrapper's gradient showing through while the
 * photo loads or when there is none. Two systems for "show a product photo"
 * would drift apart the first time one of them was changed. The reasoning for
 * each decision — why the ratio is on the wrapper, why `renderFallback` is off —
 * is spelled out there.
 *
 * Equal heights come from the body rather than from the image: the body is a
 * flex column and the footer carries `mt-auto`, so the "View details" line is
 * pinned to the bottom of every card and a long name or a two-line summary in
 * one card cannot push its neighbours' footers out of line.
 *
 * Hover: a small lift and a deeper shadow, `motion-safe:`-gated for the reason
 * given in `CategoryCard` — a `motion-reduce:` override cannot out-specify
 * Tailwind's two-class `.hover\:…:hover` rule, so it is the hover rule that has
 * to be gated.
 */
export function MachineSummaryCard({
  machine,
  locale,
  labels,
}: MachineSummaryCardProps) {
  const name = locale === 'ar' ? machine.nameAr : machine.nameEn;
  const shortDescription = (
    locale === 'ar' ? machine.shortDescriptionAr : machine.shortDescriptionEn
  ).trim();
  const categoryName = machine.category
    ? locale === 'ar'
      ? machine.category.nameAr
      : machine.category.nameEn
    : null;

  return (
    <Link
      href={`/machines/${machine.slug}`}
      // The card announces as the machine and nothing else: the category label,
      // the summary and the footer are all detail a screen-reader user reaches
      // on the machine's own page.
      aria-label={name}
      className="group flex h-full flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-stone-200 transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      {/* Same frame as CategoryCard: the wrapper owns `aspect-[4/3]` and the
          padding, the image is `contain` and complete, and the neutral plate
          shows while it loads or when there is none. */}
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-gradient-to-b from-stone-50 to-stone-100 p-3 sm:p-4">
        {machine.images?.[0]?.url ? (
          <ImageWithFallback
            src={machine.images[0].url}
            alt=""
            fit="contain"
            renderFallback={false}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
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
              <rect x="10" y="14" width="28" height="20" rx="2" />
              <path d="M18 14v20" />
              <path d="M18 20h20" />
            </svg>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-4 sm:p-5">
        {categoryName ? (
          <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
            {categoryName}
          </p>
        ) : null}
        <h3 className="mt-1 line-clamp-2 font-semibold leading-snug text-stone-900">
          {name}
        </h3>
        {shortDescription ? (
          <p className="mt-2 line-clamp-2 text-sm leading-relaxed text-stone-600">
            {shortDescription}
          </p>
        ) : null}

        {/* `mt-auto` pins this to the bottom of the flex column, which is what
            makes every card in a row the same height. */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-3">
          <span className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700">
            {labels.viewDetails}
            <svg
              aria-hidden="true"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5 rtl:rotate-180"
            >
              <path d="M4 10h11" />
              <path d="m11 6 4 4-4 4" />
            </svg>
          </span>
          {machine.featured ? (
            <span className="shrink-0 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-medium text-brand-800">
              {labels.featured}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}
