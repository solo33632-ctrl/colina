import { getTranslations } from 'next-intl/server';
import type { MachineWithImages } from './machine-card';
import { Container } from '@colina/ui';
import { MachineCard } from './machine-card';
import { Reveal } from './reveal';

type FeaturedMachinesProps = {
  machines: MachineWithImages[];
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
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {machines.map((machine) => (
            <li key={machine.id} className="h-full">
              <MachineCard machine={machine} locale={locale} />
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}
