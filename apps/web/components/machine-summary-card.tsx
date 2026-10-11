import type { Machine, MachineImage } from '@colina/db';
import { ImageWithFallback } from './image-with-fallback';
import { Link } from '@/i18n/navigation';

/** A machine with just enough to draw a card: identity, slug and one photo. */
export type MachineSummary = Pick<
  Machine,
  'id' | 'slug' | 'nameAr' | 'nameEn'
> & {
  images?: Pick<MachineImage, 'url'>[];
};

export type MachineSummaryCardProps = {
  machine: MachineSummary;
  locale: 'ar' | 'en';
};

/**
 * A machine shown as a photo and a name, nothing more.
 *
 * This is the *one* card for every machine in a grid: the home page's
 * featured row, a category's machine grid, and the related strip at the foot
 * of a machine page all render this. An earlier version had a second,
 * near-identical card that carried the short description for the home page
 * only. Two cards for the same object is how a catalog ends up looking as
 * though it was assembled from two different sites, so the description is
 * gone: every card is the product's face and its name, and the grid reads the
 * same everywhere. Each one opens its own page, which is where the
 * description belongs.
 *
 * Photo on top in a fixed `aspect-[4/3]` frame, name below in a clean white
 * area, and no text over the image — the reasoning, and the reasoning behind
 * putting the ratio on the wrapper rather than on `ImageWithFallback`, are the
 * same as in `CategoryCard`, and that card is the sibling this one has to
 * match.
 *
 * Hover lifts the card, deepens the shadow and turns the border brand orange,
 * exactly as `CategoryCard` does, so moving between a category grid and the
 * home page does not feel like leaving one design for another. The movement is
 * gated with `motion-safe:` for the same reason and with the same reasoning
 * spelled out there: a `motion-reduce:transform-none` cannot out-specify
 * Tailwind's two-class `.hover\:…:hover` rule, so it has to be the hover rule
 * that is gated rather than something cancelling it afterwards.
 */
export function MachineSummaryCard({
  machine,
  locale,
}: MachineSummaryCardProps) {
  const name = locale === 'ar' ? machine.nameAr : machine.nameEn;

  return (
    <Link
      href={`/machines/${machine.slug}`}
      className="group flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out motion-safe:hover:-translate-y-1 hover:border-brand-500 hover:shadow-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <div className="relative aspect-[4/3] w-full overflow-hidden bg-stone-100">
        <ImageWithFallback
          src={machine.images?.[0]?.url ?? null}
          alt={name}
          className="h-full w-full object-cover motion-safe:transition-transform motion-safe:duration-500 motion-safe:ease-out motion-safe:group-hover:scale-105"
        />
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold text-stone-900 transition-colors group-hover:text-brand-800">
          {name}
        </h3>
        <div
          aria-hidden="true"
          className="mt-2.5 h-0.5 w-10 scale-x-0 rounded-full bg-brand-500 motion-safe:transition-transform motion-safe:duration-300 motion-safe:ease-out motion-safe:group-hover:scale-x-100"
        />
      </div>
    </Link>
  );
}
