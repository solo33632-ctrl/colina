import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Button, Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
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
        <h1 className="mt-4 text-2xl font-bold text-stone-900 sm:text-3xl">
          {name}
        </h1>
        <p className="mt-2 max-w-3xl text-lg text-stone-600">
          {shortDescription}
        </p>

        {/* Two columns on desktop: the machine itself on the left, the quote
            panel on the right, sticking while the machine's own content is
            read. Explicit row/column placement rather than a single flow,
            because the source order has to put the panel directly under the
            gallery on mobile while sitting beside the whole left column on
            desktop — which a plain two-column flow cannot do.

            Placement keys off whether there is a gallery at all: most machines
            have no images yet, and leaving an empty first row for the gallery
            to fill would push the description a whole panel-height down.

            The gallery is a sibling, not a parent: nothing here wraps,
            overlaps or re-constrains `MachineGallery` beyond the column it
            already sat in. */}
        <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start lg:gap-12">
          {hasGallery ? (
            <section
              aria-labelledby="gallery-heading"
              className="lg:col-start-1 lg:row-start-1"
            >
              <h2
                id="gallery-heading"
                className="text-xl font-semibold text-stone-900"
              >
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

          <aside className="lg:col-start-2 lg:row-start-1 lg:row-span-2 lg:self-start lg:sticky lg:top-24">
            <QuoteRequestPanel machineRef={machineRef} />
          </aside>

          <div
            className={
              hasGallery
                ? 'lg:col-start-1 lg:row-start-2'
                : 'lg:col-start-1 lg:row-start-1'
            }
          >
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

            <section aria-labelledby="specs-heading" className="mt-10">
              <h2
                id="specs-heading"
                className="text-xl font-semibold text-stone-900"
              >
                {t('specsHeading')}
              </h2>
              <p className="mt-2 max-w-3xl whitespace-pre-line text-stone-600">
                {specs}
              </p>
              {machine.datasheetUrl ? (
                <div className="mt-4">
                  <Button href={machine.datasheetUrl} download>
                    {t('datasheetLabel')}
                  </Button>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      </Container>

      <RelatedMachines
        machines={related}
        locale={locale}
        categorySlug={machine.category.slug}
      />
    </main>
  );
}
