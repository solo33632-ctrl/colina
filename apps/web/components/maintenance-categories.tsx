import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { CategoryCard } from './category-card';
import { Reveal } from './reveal';
import { ViewAllLink } from './view-all-link';
import type { MaintenanceLineSummary } from '@/lib/maintenance';

/**
 * How many lines the home page shows before sending the visitor to
 * /maintenance. The page fetches one extra row so this component can tell
 * whether a "View all" link is needed without counting separately.
 */
export const HOME_MAINTENANCE_LIMIT = 6;

type MaintenanceCategoriesProps = {
  lines: MaintenanceLineSummary[];
  locale: 'ar' | 'en';
};

/**
 * The maintenance production lines, as the same square tiles as the product
 * categories directly above them.
 *
 * The section is the public entry point to /maintenance: a visitor picks the
 * line their machine belongs to and lands on that line's before/after cards.
 * It renders NOTHING when no line has a machine yet, for the same reason the
 * 30b showcase did — a heading over an empty grid says "there is nothing to
 * see", which is true but useless.
 *
 * `lines` arrives already filtered to lines with at least one item and
 * ordered by the admin. The cap is presentation only: the index page reads
 * the same list without it.
 */
export async function MaintenanceCategories({
  lines,
  locale,
}: MaintenanceCategoriesProps) {
  if (lines.length === 0) return null;

  const t = await getTranslations('MaintenanceShowcase');
  const pages = await getTranslations('MaintenancePages');
  const visible = lines.slice(0, HOME_MAINTENANCE_LIMIT);
  const hasMore = lines.length > HOME_MAINTENANCE_LIMIT;

  return (
    <section aria-labelledby="maintenance-categories-heading">
      <Container className="pb-16">
        <Reveal className="delay-75" waitForIntro>
          <h2
            id="maintenance-categories-heading"
            className="text-center text-3xl font-bold text-stone-900 sm:text-4xl"
          >
            {t('heading')}
          </h2>
          <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        </Reveal>
        {/* Same classes as the product categories grid, so the two sections
            line up column for column. */}
        <ul className="mx-auto mt-12 grid max-w-6xl gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((line) => (
            <li key={line.id}>
              <CategoryCard
                category={{
                  slug: line.slug,
                  nameEn: line.nameEn,
                  nameAr: line.nameAr,
                  image: line.coverImage,
                }}
                href={`/maintenance/${line.slug}`}
                locale={locale}
                hoverText={t('hoverText')}
                viewLabel={t('viewLabel')}
              />
            </li>
          ))}
        </ul>
        {hasMore ? (
          <ViewAllLink href="/maintenance" label={pages('viewAll')} />
        ) : null}
      </Container>
    </section>
  );
}
