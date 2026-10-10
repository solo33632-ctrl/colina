import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import {
  MachineSummaryCard,
  type MachineSummary,
} from './machine-summary-card';
import { Link } from '@/i18n/navigation';
import { Reveal } from './reveal';

export type RelatedMachinesProps = {
  machines: MachineSummary[];
  locale: 'ar' | 'en';
  /** Slug of the category this machine belongs to, for the "see all" link. */
  categorySlug: string;
};

/**
 * Other machines in the same category, at the bottom of a machine page.
 *
 * Renders nothing at all when there is no one to show. A "related machines"
 * strip holding a single card reads as a mistake, and an empty one as a bug,
 * so the section is omitted rather than padded out.
 */
export async function RelatedMachines({
  machines,
  locale,
  categorySlug,
}: RelatedMachinesProps) {
  if (machines.length === 0) return null;

  const t = await getTranslations('RelatedMachines');

  return (
    <section
      aria-labelledby="related-heading"
      className="border-t border-stone-200 bg-white"
    >
      <Container className="py-16">
        <Reveal>
          <h2
            id="related-heading"
            className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {t('heading')}
          </h2>
          <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        </Reveal>
        <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {machines.map((machine) => (
            <li key={machine.id}>
              <MachineSummaryCard machine={machine} locale={locale} />
            </li>
          ))}
        </ul>
        <p className="mt-8 text-center">
          <Link
            href={`/categories/${categorySlug}`}
            className="text-sm font-medium text-brand-700 hover:text-brand-800"
          >
            {t('browseCategory')}
          </Link>
        </p>
      </Container>
    </section>
  );
}
