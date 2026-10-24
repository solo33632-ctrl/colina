import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { CategoryCard } from './category-card';
import { Reveal } from './reveal';
import { Link } from '@/i18n/navigation';
import type { MaintenanceLineSummary } from '@/lib/maintenance';

/** How many lines the home page shows before sending the visitor to /maintenance. */
const HOME_LIMIT = 6;

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
  const visible = lines.slice(0, HOME_LIMIT);
  const hasMore = lines.length > HOME_LIMIT;

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
                countLabel={pages('machineCount', { count: line.itemCount })}
                locale={locale}
              />
            </li>
          ))}
        </ul>
        {hasMore ? (
          <div className="mt-8 text-center">
            <Link
              href="/maintenance"
              className="inline-flex rounded-md font-medium text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {pages('viewAll')}
            </Link>
          </div>
        ) : null}
      </Container>
    </section>
  );
}
