import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
import { MachineSummaryCard } from '@/components/machine-summary-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { Reveal } from '@/components/reveal';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateStaticParams() {
  const categories = await prisma.machineCategory.findMany({
    select: { slug: true },
  });
  return categories.map((category) => ({ slug: category.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const category = await prisma.machineCategory.findUnique({
    where: { slug },
  });
  if (!category) {
    return {};
  }
  return {
    title: locale === 'ar' ? category.nameAr : category.nameEn,
    description:
      locale === 'ar' ? category.descriptionAr : category.descriptionEn,
    alternates: await localeAlternates(`/categories/${slug}`, locale),
  };
}

export default async function CategoryDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('CategoryPage');
  const nav = await getTranslations('Nav');
  const card = await getTranslations('MachineCard');
  const category = await prisma.machineCategory.findUnique({
    where: { slug },
    include: {
      machines: {
        orderBy: { createdAt: 'asc' },
        include: {
          // The card labels each machine with its category, so the grid needs
          // the parent row as well as the first photo.
          category: true,
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
      },
    },
  });

  if (!category) {
    notFound();
  }

  const name = locale === 'ar' ? category.nameAr : category.nameEn;
  const description =
    locale === 'ar' ? category.descriptionAr : category.descriptionEn;
  const hasDescription = description.trim().length > 0;

  const breadcrumb = (
    <Breadcrumb
      label={t('breadcrumbLabel')}
      items={[
        { label: nav('home'), href: '/' },
        { label: t('categoriesCrumb'), href: '/categories' },
        { label: name },
      ]}
    />
  );

  return (
    <main>
      <PageViewTracker path={`/categories/${slug}`} locale={locale} />

      {/* The category hero loads ZERO images.

          It used to render the category photo twice — a blurred full-bleed
          backdrop plus a framed, letterboxed copy in the middle. Both were
          "always complete" in the sense that neither cropped, but together they
          meant the top of every category page shipped and decoded a photo before
          a visitor had read a single word, and a tall upload still had to be
          squeezed into a fixed-height frame to fit. A band carries the same
          information for none of that cost: the depth comes from CSS gradients
          and a repeating pattern, which are a few hundred bytes of CSS rather
          than a network request, and the layout is identical whatever the
          upload's proportions.

          The pattern and the highlight are decorative, so they are `aria-hidden`
          siblings rather than backgrounds on the text column — nothing about the
          heading depends on them being painted. */}
      <section
        id="category-hero"
        className="relative isolate overflow-hidden bg-brand-900"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 bg-gradient-to-b from-brand-800/70 via-brand-900/50 to-brand-950/80"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 [background-image:repeating-linear-gradient(135deg,rgba(255,255,255,0.05)_0px,rgba(255,255,255,0.05)_1px,transparent_1px,transparent_16px)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-72 bg-[radial-gradient(ellipse_at_top,rgba(235,105,63,0.38),transparent_65%)]"
        />
        <Container className="relative flex flex-col items-center px-4 py-10 text-center sm:px-6 sm:py-14 [&_ol]:w-fit [&_ol]:max-w-full [&_ol]:justify-center">
          <div className="[&_ol]:text-brand-200 [&_a]:text-brand-100 [&_a:hover]:text-white [&_span[aria-current]]:text-white">
            {breadcrumb}
          </div>
          <h1 className="mt-3 max-w-3xl text-2xl font-bold text-white sm:text-4xl">
            {name}
          </h1>
          {/* How much there is to see, stated up front rather than discovered by
              scrolling. Pluralised per locale (`heroCountPill`), and always
              rendered — "0 machines" is information, not an empty state. */}
          <span
            id="category-hero-count"
            className="mt-4 shrink-0 rounded-full bg-brand-800/70 px-3.5 py-1 text-sm font-medium text-brand-100 ring-1 ring-brand-700"
          >
            {t('heroCountPill', { count: category.machines.length })}
          </span>
          {hasDescription ? (
            <p
              id="category-description"
              className="mt-6 max-w-3xl leading-relaxed text-brand-100"
            >
              {description}
            </p>
          ) : null}
        </Container>
      </section>

      <Container className="py-16">
        {/* The description used to be repeated here as well as in the hero.
            It is now rendered once, inside the band — two elements sharing
            `id="category-description"` is invalid HTML and made the id
            ambiguous for both tests and assistive tech. */}
        <Reveal className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">
              {t('machinesHeading')}
            </h2>
            <p className="text-sm text-stone-500">
              {t('machineCount', { count: category.machines.length })}
            </p>
          </div>
        </Reveal>

        {category.machines.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            {t('machinesEmpty')}
          </p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {category.machines.map((machine) => (
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
