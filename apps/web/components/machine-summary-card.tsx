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
 * Deliberately lighter than `MachineCard`, which carries the short
 * description for a grid where the text matters. Here the grid is a way of
 * choosing between machines and every one of them opens its own page, so the
 * card is the product's face and its name — the same shape used on the
 * category page and in the related-machines strip, so a visitor moving between
 * those two places is looking at one consistent card.
 */
export function MachineSummaryCard({
  machine,
  locale,
}: MachineSummaryCardProps) {
  const name = locale === 'ar' ? machine.nameAr : machine.nameEn;

  return (
    <Link
      href={`/machines/${machine.slug}`}
      className="group block h-full overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow,border-color] duration-300 ease-out hover:-translate-y-0.5 hover:border-brand-200 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600 motion-reduce:transform-none motion-reduce:transition-none"
    >
      <div className="overflow-hidden bg-brand-50">
        <ImageWithFallback
          src={machine.images?.[0]?.url ?? null}
          alt={name}
          fallbackClassName="bg-brand-50"
          className="aspect-[4/3] w-full object-cover transition-transform duration-500 ease-out group-hover:scale-105 motion-reduce:transform-none motion-reduce:transition-none"
        />
      </div>
      <div className="p-4">
        <h3 className="text-base font-semibold text-stone-900 transition-colors group-hover:text-brand-800">
          {name}
        </h3>
      </div>
    </Link>
  );
}
