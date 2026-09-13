import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Button, Container } from '@colina/ui';
import { ImageWithFallback } from '@/components/image-with-fallback';
import { MachineCard } from '@/components/machine-card';
import { Link } from '@/i18n/navigation';
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
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: productJsonLd }}
      />
      <Container className="py-16">
        <p className="text-sm text-stone-500">
          {t('categoryLabel')}:{' '}
          <Link
            href={`/categories/${machine.category.slug}`}
            className="font-medium text-brand-700 hover:text-brand-800"
          >
            {categoryName}
          </Link>
        </p>
        <h1 className="mt-2 text-2xl font-bold text-stone-900 sm:text-3xl">
          {name}
        </h1>
        <p className="mt-2 max-w-3xl text-lg text-stone-600">
          {shortDescription}
        </p>

        {machine.images.length > 0 ? (
          <section aria-labelledby="gallery-heading" className="mt-10">
            <h2
              id="gallery-heading"
              className="text-xl font-semibold text-stone-900"
            >
              {t('galleryHeading')}
            </h2>
            <ul className="mt-4 grid gap-4 sm:grid-cols-2">
              {machine.images.map((image) => (
                <li
                  key={image.id}
                  className="overflow-hidden rounded-xl border border-stone-200"
                >
                  <ImageWithFallback src={image.url} alt={name} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="description-heading" className="mt-10">
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

        {machine.relatedMachines.length > 0 ? (
          <section aria-labelledby="related-heading" className="mt-10">
            <h2
              id="related-heading"
              className="text-xl font-semibold text-stone-900"
            >
              {t('relatedHeading')}
            </h2>
            <ul className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {machine.relatedMachines.map((related) => (
                <li key={related.id}>
                  <MachineCard machine={related} locale={locale} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </Container>
    </main>
  );
}
