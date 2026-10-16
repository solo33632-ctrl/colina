import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Button, Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
import { Link } from '@/i18n/navigation';
import { MachineGallery } from '@/components/machine-gallery';
import { PageViewTracker } from '@/components/page-view-tracker';
import { QuoteRequestPanel } from '@/components/quote-request-panel';
import { RelatedMachines } from '@/components/related-machines';
import { routing } from '@/i18n/routing';
import { absoluteImageUrl, localeAlternates, serializeJsonLd } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateStaticParams() {
  const machines = await prisma.machine.findMany({
    select: { slug: true },
  });
  return machines.map((machine) => ({ slug: machine.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const machine = await prisma.machine.findUnique({
    where: { slug },
  });
  if (!machine) {
    return {};
  }
  return {
    title: locale === 'ar' ? machine.nameAr : machine.nameEn,
    description:
      locale === 'ar' ? machine.shortDescriptionAr : machine.shortDescriptionEn,
    alternates: await localeAlternates(`/machines/${slug}`, locale),
  };
}

export default async function MachineDetailPage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('MachinePage');
  const nav = await getTranslations('Nav');
  const machine = await prisma.machine.findUnique({
    where: { slug },
    include: {
      category: true,
      images: { orderBy: { position: 'asc' } },
      relatedMachines: {
        include: {
          // Same reason as the category grid: the shared card prints the
          // machine's category as a label above its name.
          category: true,
          images: { orderBy: { position: 'asc' }, take: 1 },
        },
      },
    },
  });

  if (!machine) {
    notFound();
  }

  const name = locale === 'ar' ? machine.nameAr : machine.nameEn;
  const shortDescription =
    locale === 'ar' ? machine.shortDescriptionAr : machine.shortDescriptionEn;
  const description =
    locale === 'ar' ? machine.descriptionAr : machine.descriptionEn;
  const specs = locale === 'ar' ? machine.specsAr : machine.specsEn;
  // The long-form fields are optional: a machine saved with these blank
  // renders no section for them at all (see the admin schema).
  const hasDescription = description.trim().length > 0;
  const hasSpecs = specs.trim().length > 0;
  const categoryName =
    locale === 'ar' ? machine.category.nameAr : machine.category.nameEn;

  // What the admin reads as "machine / model" on the resulting lead: the
  // localized name plus the stable slug, so the lead names the machine and
  // the exact page it came from. Built here, on the server, from the
  // database row rather than from the URL.
  const machineRef = `${name} (${machine.slug})`;

  // Drives the desktop grid placement below.
  const hasGallery = machine.images.length > 0;

  // Related machines, capped. The admin's curated links win when there are
  // any — that is an existing, working feature and this must not quietly
  // discard it. Otherwise fall back to the rest of the category, which is
  // what makes the strip useful on a fresh catalogue where nothing has been
  // curated yet. Either way the machine itself is excluded (a curated link
  // pointing back at itself is possible) and the list is capped so the grid
  // never turns into a second catalogue listing.
  const RELATED_LIMIT = 4;
  const curated = machine.relatedMachines.filter(
    (row) => row.id !== machine.id
  );
  const related =
    curated.length > 0
      ? curated.slice(0, RELATED_LIMIT)
      : await prisma.machine.findMany({
          where: { categoryId: machine.categoryId, id: { not: machine.id } },
          orderBy: { createdAt: 'asc' },
          include: { images: { orderBy: { position: 'asc' }, take: 1 } },
          take: RELATED_LIMIT,
        });

  // Product structured data WITHOUT offers/reviews: these are B2B machines
  // sold by quote (no prices, no ratings). Google's product rich results
  // require valid Offer data — inventing prices would be spam, so the
  // markup stays offer-less (valid schema.org, no rich-result claim).
  const { canonical } = await localeAlternates(`/machines/${slug}`, locale);
  const firstImage = absoluteImageUrl(machine.images[0]?.url ?? null);
  const productJsonLd = serializeJsonLd({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name,
    description: shortDescription,
    ...(firstImage ? { image: firstImage } : {}),
    category: categoryName,
    brand: { '@type': 'Brand', name: 'Colina' },
    url: canonical,
  });

  return (
    <main>
      <PageViewTracker path={`/machines/${slug}`} locale={locale} />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLd }}
      />
      <Container className="py-16">
        <Breadcrumb
          label={t('breadcrumbLabel')}
          items={[
            { label: nav('home'), href: '/' },
            {
              label: categoryName,
              href: `/categories/${machine.category.slug}`,
            },
            { label: name },
          ]}
        />
        {/* The page reads: photo -> what this machine is and one clear way to
            ask about it -> the detail sections -> the quote form itself.

            The photo and the summary sit side by side on desktop, and stack on
            mobile with the photo first. Explicit row/column placement rather
            than a single flow, because the source order has to put the summary
            directly under the gallery on mobile while sitting beside it on
            desktop — which a plain two-column flow cannot do.

            Placement keys off whether there is a gallery at all: most machines
            have no images yet, and leaving an empty first row for the gallery
            to fill would push the summary a whole panel-height down.

            The gallery is a sibling, not a parent: nothing here wraps,
            overlaps or re-constrains `MachineGallery` beyond the column it
            already sat in. */}
        <div className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12">
          {hasGallery ? (
            <section
              aria-labelledby="gallery-heading"
              className="lg:col-start-1 lg:row-start-1"
            >
              {/* Screen-reader only. The frame's photo and its thumbnails say
                  what this section is; the visible heading was a second label
                  sitting above them and pushed the photo down the page. The id
                  and the section's `aria-labelledby` are unchanged, so the
                  region still has its accessible name. */}
              <h2 id="gallery-heading" className="sr-only">
                {t('galleryHeading')}
              </h2>
              <MachineGallery
                images={machine.images.map((image) => ({
                  id: image.id,
                  url: image.url,
                }))}
                alt={name}
              />
            </section>
          ) : null}

          {/* What this machine is, and the one thing a visitor here is likely to
              want: a quote. The h1 and the short description moved down into
              this column from above the grid, so the photo is the first thing
              on the page and the name is read next to it. The button is a plain
              anchor to the form further down — no client JS, and it works with
              the keyboard, and the form it jumps to is the same component the
              side column used to hold. */}
          <div className="lg:col-start-2 lg:row-start-1 lg:self-start">
            <p className="text-xs font-semibold uppercase tracking-wide text-brand-600">
              <Link href={`/categories/${machine.category.slug}`}>
                {categoryName}
              </Link>
            </p>
            <h1 className="mt-2 text-2xl font-bold text-stone-900 sm:text-3xl">
              {name}
            </h1>
            <p className="mt-3 text-stone-600">{shortDescription}</p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button href="#quote" size="lg">
                {t('requestQuote')}
              </Button>
              {machine.datasheetUrl ? (
                <Button
                  href={machine.datasheetUrl}
                  download
                  variant="secondary"
                >
                  {t('datasheetLabel')}
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        {/* The detail sections, in a readable measure under the photo row. */}
        <div className="mt-16 max-w-3xl">
          {hasDescription ? (
            <section aria-labelledby="description-heading">
              <h2
                id="description-heading"
                className="text-xl font-semibold text-stone-900"
              >
                {t('descriptionHeading')}
              </h2>
              <p className="mt-2 max-w-3xl whitespace-pre-line text-stone-600">
                {description}
              </p>
            </section>
          ) : null}

          {/* The specs section also carries the datasheet button. When the
                prose is blank the section still renders if a datasheet is
                attached (the button alone), and disappears entirely only
                when both are absent — so blanking the specs never silently
                hides the download. */}
          {hasSpecs ? (
            <section
              aria-labelledby="specs-heading"
              className={hasDescription ? 'mt-10' : undefined}
            >
              <h2
                id="specs-heading"
                className="text-xl font-semibold text-stone-900"
              >
                {t('specsHeading')}
              </h2>
              <p className="mt-2 whitespace-pre-line text-stone-600">{specs}</p>
            </section>
          ) : null}
        </div>

        {/* The quote section: where the button above leads. It is a real
            landmark with a visible heading, and it sits after the detail the
            visitor may want to read first rather than beside the photo where it
            used to be a sticky side panel.

            `scroll-mt` keeps the heading clear of the sticky site header when
            the anchor is followed, so the visitor lands on the heading rather
            than on a strip of it hidden underneath. */}
        <section
          id="quote"
          aria-labelledby="quote-heading"
          className="mt-16 scroll-mt-24"
        >
          <h2
            id="quote-heading"
            className="text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {t('quoteHeading')}
          </h2>
          <div className="mt-6 max-w-3xl">
            <QuoteRequestPanel machineRef={machineRef} />
          </div>
        </section>
      </Container>

      <RelatedMachines
        machines={related}
        locale={locale}
        categorySlug={machine.category.slug}
      />
    </main>
  );
}
