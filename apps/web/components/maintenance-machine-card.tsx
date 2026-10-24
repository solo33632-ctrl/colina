import { getTranslations } from 'next-intl/server';
import { BeforeAfterSlider } from './before-after-slider';
import { Link } from '@/i18n/navigation';

/** The columns a machine card and the detail slider need. */
export type MaintenanceMachine = {
  id: string;
  nameEn: string;
  nameAr: string;
  beforeImageUrl: string;
  afterImageUrl: string;
};

type MaintenanceMachineCardProps = {
  item: MaintenanceMachine;
  /** The line's slug, so the name links to the machine inside this line. */
  lineSlug: string;
  locale: 'ar' | 'en';
  /** `sizes` hint for the two slider images; the grid knows its own width. */
  sizes: string;
};

/**
 * One maintenance machine: the before/after comparison in a 4:3 frame, with
 * the machine's name BELOW the image rather than over it.
 *
 * The name is outside the slider on purpose. A caption laid over the photo
 * would have to be pointer-transparent to avoid swallowing a drag, and even
 * then it would sit on top of the divider's travel; below the frame it is a
 * normal link, always readable, and can never intercept a pointer.
 *
 * The card lifts on hover and on keyboard focus, gated with `motion-safe:` for
 * the same reason as the product category tile (see the long note in
 * `category-card.tsx`): under `prefers-reduced-motion: reduce` both the hover
 * rule and a `motion-reduce:` rule would match, and the more specific hover
 * rule would win.
 */
export async function MaintenanceMachineCard({
  item,
  lineSlug,
  locale,
  sizes,
}: MaintenanceMachineCardProps) {
  const t = await getTranslations('MaintenanceShowcase');
  const name = locale === 'ar' ? item.nameAr : item.nameEn;

  return (
    <article className="flex h-full flex-col overflow-hidden rounded-lg border border-stone-200 bg-white shadow-sm transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-2 motion-safe:focus-within:-translate-y-2 hover:shadow-xl">
      <div className="aspect-[4/3] overflow-hidden bg-stone-100">
        <BeforeAfterSlider
          beforeSrc={item.beforeImageUrl}
          afterSrc={item.afterImageUrl}
          beforeAlt={t('photoAlt', { name })}
          afterAlt={t('photoAltAfter', { name })}
          beforeLabel={t('before')}
          afterLabel={t('after')}
          sliderLabel={t('compare')}
          // The raw message, not a formatted one: the slider substitutes the
          // number itself, because the position changes long after this page
          // has rendered.
          valueTextTemplate={t.raw('valueText')}
          sizes={sizes}
        />
      </div>
      <h3 className="px-4 py-3 text-center text-base font-medium leading-snug">
        <Link
          href={`/maintenance/${lineSlug}/${item.id}`}
          className="line-clamp-2 text-stone-900 underline-offset-4 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {name}
        </Link>
      </h3>
    </article>
  );
}
