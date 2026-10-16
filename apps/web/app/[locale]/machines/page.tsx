import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { MachineSummaryCard } from '@/components/machine-summary-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { Link } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// The grid is filtered by the `?category=` query, which makes this page
// request-dependent, so the hourly window below does not apply to it the way
// it does to the static pages. It is still declared for consistency with the
// rest of the site and to keep the data path documented in one place.
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ category?: string | string[] }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    return {};
  }
  const t = await getTranslations({ locale, namespace: 'Machines' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/machines', locale),
  };
}

/**
 * The requested category slug, or `null` for "all".
 *
 * An unknown or repeated slug is treated as "all" rather than as an error or an
 * empty grid: the chips are ordinary links, so a stale bookmark, a mistyped
 * URL or a crawler appending its own `?category=` must still land on a usable
 * page. `null` then also means the "All" chip is the active one, which is what
 * the visitor sees.
 */
function requestedCategorySlug(value: string | string[] | undefined) {
  const slug = Array.isArray(value) ? value[0] : value;
  return typeof slug === 'string' && slug.trim() !== '' ? slug.trim() : null;
}

export default async function MachinesPage({ params, searchParams }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('Machines');
  const card = await getTranslations('MachineCard');

  const { category: rawCategory } = await searchParams;
  const requested = requestedCategorySlug(rawCategory);

  // Every category, so the chip row is a complete way into the catalogue and
  // not just the categories that happen to hold a machine right now.
  const categories = await prisma.machineCategory.findMany({
    orderBy: { createdAt: 'asc' },
  });

  // Resolve the requested slug against the real rows BEFORE querying machines.
  // An unknown slug falls back to "all": the grid is the full catalogue and the
  // "All" chip is highlighted, so the page never looks broken. Doing this after
  // the machine query — or filtering on the raw string — is what made
  // `?category=no-such-category` render an empty grid while claiming "All" was
  // the active filter.
  const activeSlug = categories.some((c) => c.slug === requested)
    ? requested
    : null;

  const machines = await prisma.machine.findMany({
    // Pagination lands in a later stage. The filter is already a plain
    // `where` object, so adding `skip`/`take` here is a two-line change and
    // the chips need no rework.
    where: activeSlug ? { category: { slug: activeSlug } } : undefined,
    orderBy: [{ createdAt: 'asc' }],
    include: {
      category: true,
      images: { orderBy: { position: 'asc' }, take: 1 },
    },
  });

  return (
    <main>
      <PageViewTracker path="/machines" locale={locale} />
      <Container className="py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-stone-600">
          {t('subheading')}
        </p>

        {categories.length === 0 ? null : (
          <nav
            aria-label={t('filterLabel')}
            className="mt-8 flex flex-nowrap gap-2 overflow-x-auto pb-2 sm:justify-center"
          >
            {/* "All" first, then one chip per category by NAME — the names are
                the point: a visitor recognises "Packaging Machines" without
                opening it, which is the whole reason the chips are names and
                not slugs.

                Plain links with a query string: the whole filter works with no
                client JavaScript, is shareable, and survives a reload. The row
                is `flex-nowrap overflow-x-auto`, so on a narrow screen the
                chips scroll sideways inside their own box while the page itself
                keeps its width — the negative margin and padding let the scroller
                bleed to the screen edge without widening the document. */}
            <CategoryChip
              href="/machines"
              label={t('allCategories')}
              isActive={activeSlug === null}
            />
            {categories.map((category) => (
              <CategoryChip
                key={category.id}
                href={`/machines?category=${category.slug}`}
                label={locale === 'ar' ? category.nameAr : category.nameEn}
                isActive={activeSlug === category.slug}
              />
            ))}
          </nav>
        )}

        <p className="mt-6 text-center text-sm text-stone-500">
          {t('count', { count: machines.length })}
        </p>

        {machines.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            {t('empty')}
          </p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
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
        )}
      </Container>
    </main>
  );
}

/** One filter chip: a link that carries the whole filter state in its href. */
function CategoryChip({
  href,
  label,
  isActive,
}: {
  href: string;
  label: string;
  isActive: boolean;
}) {
  return (
    <Link
      href={href}
      // `aria-current="page"` is what tells a screen reader which filter is
      // applied; the visual difference is decoration on top of it, never a
      // substitute for it.
      aria-current={isActive ? 'page' : undefined}
      className={[
        'inline-flex shrink-0 items-center whitespace-nowrap rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600',
        isActive
          ? 'bg-brand-900 text-white'
          : 'bg-stone-100 text-stone-700 hover:bg-stone-200',
      ].join(' ')}
    >
      {label}
    </Link>
  );
}
