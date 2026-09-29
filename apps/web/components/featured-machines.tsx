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
 * The machines shown on the home page.
 *
 * There is no `featured` flag on `Machine` yet, so this is a stand-in: the
 * first machines in creation order, which is the same ordering rule the
 * category grid and the admin list already use, so nothing behaves oddly next
 * to it. It is deliberately NOT a curated list and cannot be arranged by an
 * editor — a `featured` boolean plus an admin toggle is the real fix and needs
 * a Prisma migration, which was out of scope for this step.
 */
export async function FeaturedMachines({
  machines,
  locale,
}: FeaturedMachinesProps) {
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
        {machines.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {machines.map((machine) => (
              <li key={machine.id} className="h-full">
                <MachineCard machine={machine} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </section>
  );
}
