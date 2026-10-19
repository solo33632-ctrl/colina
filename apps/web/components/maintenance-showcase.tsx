import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { BeforeAfterSlider } from './before-after-slider';
import { Reveal } from './reveal';

export type MaintenanceShowcaseItem = {
  id: string;
  nameEn: string;
  nameAr: string;
  beforeImageUrl: string;
  afterImageUrl: string;
};

type MaintenanceShowcaseProps = {
  showcases: MaintenanceShowcaseItem[];
  locale: 'ar' | 'en';
};

/**
 * Maintenance jobs, shown as before/after comparisons the visitor drags.
 *
 * `showcases` is already ordered and capped by the page's query, so this
 * component only lays them out. Like the section it replaced, it renders
 * NOTHING when the list is empty: a heading with no comparisons under it would
 * state that there is nothing to see, which is the opposite of what an empty
 * table means — nobody has added one yet.
 *
 * The grid classes are the categories grid's, verbatim, so the two sections
 * read as one page rather than as two things a visitor has to reconcile. The
 * cards are the same square tile at the same radius with the same hover lift,
 * also gated on `motion-safe:` for the same reason as the category card (see
 * the long note in `category-card.tsx`: under a reduced-motion preference both
 * the hover rule and the `motion-reduce` rule would match, and the more
 * specific hover rule would win, so the lift would survive the very setting it
 * is meant to obey).
 *
 * The tile OWNS the `aspect-square` ratio, never the images inside it: the
 * slider's two layers are `h-full w-full object-cover`, so the frame is
 * declared exactly once and the two photographs cannot disagree about the size
 * they are drawn into.
 *
 * The name sits in a strip along the bottom, `pointer-events-none` so it can
 * never intercept a drag that passes over it, and the handle is vertically
 * centred in the tile — which keeps its travel clear of a strip that is only
 * about 3.5rem tall at the bottom of a square that is several times that.
 */
export async function MaintenanceShowcase({
  showcases,
  locale,
}: MaintenanceShowcaseProps) {
  if (showcases.length === 0) return null;

  const t = await getTranslations('MaintenanceShowcase');

  return (
    <section aria-labelledby="maintenance-showcase-heading">
      <Container className="pb-16">
        <Reveal className="delay-75" waitForIntro>
          <h2
            id="maintenance-showcase-heading"
            className="text-center text-3xl font-bold text-stone-900 sm:text-4xl"
          >
            {t('heading')}
          </h2>
          <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        </Reveal>
        {/* Same classes as the categories grid, so the two sections line up
            column for column. */}
        <ul className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {showcases.map((item) => {
            const name = locale === 'ar' ? item.nameAr : item.nameEn;
            return (
              <li key={item.id}>
                <div className="group relative block aspect-square overflow-hidden rounded-lg bg-white transition-[transform,box-shadow] duration-300 ease-out motion-safe:hover:-translate-y-2 motion-safe:focus-within:-translate-y-2 hover:shadow-xl">
                  <BeforeAfterSlider
                    beforeSrc={item.beforeImageUrl}
                    afterSrc={item.afterImageUrl}
                    beforeAlt={t('photoAlt', { name })}
                    afterAlt={t('photoAltAfter', { name })}
                    beforeLabel={t('before')}
                    afterLabel={t('after')}
                    sliderLabel={t('compare')}
                    // The raw message, not a formatted one: the slider
                    // substitutes the number itself, because the position
                    // changes long after this page has rendered.
                    valueTextTemplate={t.raw('valueText')}
                    // One image in a third of a 72rem container: a tile is at
                    // most ~23rem wide and renders at 1x or 2x.
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                  />
                  {/* The strip. `pointer-events-none` all the way down, so the
                      name can never take a click that means "move the
                      divider". `dir` is set explicitly because the slider above
                      pins itself to ltr and the page locale has to be restored
                      for the text. */}
                  <p
                    dir={locale}
                    className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 via-black/55 to-transparent px-3 pb-2.5 pt-6 text-center text-sm font-medium leading-snug text-white"
                  >
                    <span className="line-clamp-2">{name}</span>
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </Container>
    </section>
  );
}
