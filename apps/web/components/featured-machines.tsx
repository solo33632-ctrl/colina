import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import {
  MachineSummaryCard,
  type MachineSummary,
} from './machine-summary-card';
import { Reveal } from './reveal';

type FeaturedMachinesProps = {
  machines: MachineSummary[];
  locale: 'ar' | 'en';
};

/**
 * The admin-curated machines shown on the home page. `machines` is already
 * filtered to `featured`, ordered and capped by the page's query
 * (FEATURED_MACHINES_LIMIT), so this component only lays them out.
 *
 * Renders nothing at all when the list is empty. An earlier version showed an
 * "empty" message here, but that is the wrong shape: the section exists to
 * present a decision somebody made, and printing it with no machines under a
 * heading called "Featured machines" states the opposite. Returning null also
 * leaves no gap, where a heading with nothing under it would.
 */
export async function FeaturedMachines({
  machines,
  locale,
}: FeaturedMachinesProps) {
  if (machines.length === 0) return null;

  const t = await getTranslations('FeaturedMachines');
  const card = await getTranslations('MachineCard');

  return (
    <section aria-labelledby="featured-machines-heading">
      <Container className="pb-16">
        <Reveal className="delay-150" waitForIntro>
          <h2
            id="featured-machines-heading"
            className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {t('heading')}
          </h2>
          <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        </Reveal>
        {/*
          Centred and self-sizing, so a row that is not full does not leave a
          hole beside it. `auto-fit` collapses the tracks a short row leaves
          unused — they take no space — and `justify-content: center` pulls
          whatever is left into the middle. The plain `sm:grid-cols-2
          lg:grid-cols-3` this replaced reserved three tracks regardless, so a
          single featured machine sat in column one with two thirds of the
          page empty next to it, which read as a broken layout rather than as
          a section holding one machine.

          The 16rem/22rem bounds replace fixed column counts: 16rem is the
          narrowest a card can be before its own text wraps badly, and 22rem
          is how wide a machine card should ever get, so on a wide screen the
          row stays a comfortable block under a centred heading instead of
          stretching to the full container width. Both are plain CSS
          custom-property-free values, so no new dependency and no plugin.

          At 640px two cards still sit side by side, and from roughly 1200px
          three do, which is what the fixed breakpoints produced — so this
          changes how a partial row is placed, not how many cards fit.
        */}
        <ul className="mt-8 grid justify-center gap-6 [grid-template-columns:repeat(auto-fit,minmax(16rem,22rem))]">
          {machines.map((machine) => (
            <li key={machine.id} className="h-full">
              <MachineSummaryCard
                machine={machine}
                locale={locale}
                labels={{
                  viewDetails: card('viewDetails'),
                  featured: card('featured'),
                }}
              />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
