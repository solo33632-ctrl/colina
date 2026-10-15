import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
import { ImageWithFallback } from '@/components/image-with-fallback';
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
  const category = await prisma.machineCategory.findUnique({
    where: { slug },
    include: {
      machines: {
        orderBy: { createdAt: 'asc' },
        include: {
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

  // Over a photo the trail is recoloured for the dark banner; over the plain
  // brand band it takes the light-on-dark treatment that band already has.
  const breadcrumbTone = category.image
    ? '[&_ol]:text-stone-300 [&_a]:text-white [&_a:hover]:text-brand-200 [&_span[aria-current]]:text-white'
    : '[&_ol]:text-brand-200 [&_a]:text-brand-100 [&_a:hover]:text-white [&_span[aria-current]]:text-white';

  return (
    <main>
      <PageViewTracker path={`/categories/${slug}`} locale={locale} />

      {/* The category's own photo as a banner, with the title over it and a
          scrim carrying the text so the title stays legible whatever the
          photo. A category without a photo gets a plain brand band rather than
          an empty banner — most categories have no image yet, and a grey
          placeholder hero reads as broken, not as "no photo yet".

          Phase 27 layout — a centered stack (structure reference: a centered
          product visual, nothing else borrowed): the blurred, darkened
          full-bleed copy is the decorative backdrop, and the photo itself is
          rendered again below the title, `object-contain` so it is always
          complete however tall or wide the upload is. A thin light ring and
          soft shadow turn the letterboxed frame into a deliberate card, so a
          white-background studio shot reads as a card and not a floating
          cutout. Everything sits in normal flow (title above the photo), so
          the text can never overlap the photo, and the stack is symmetric:
          RTL needs no mirroring.

          Chosen dimensions (see report): photo capped at 9rem/13rem tall
          (h-36/h-52), banner lands around 20rem on mobile and 23–26rem on
          desktop — roughly 34–38% of a 1080px-tall laptop viewport. */}
      {category.image ? (
        <section className="relative isolate overflow-hidden bg-brand-900">
          <ImageWithFallback
            src={category.image}
            alt=""
            loading="eager"
            id="category-hero-backdrop"
            className="absolute inset-0 h-full w-full scale-105 object-cover blur-md"
            fallbackClassName="bg-brand-900"
          />
          {/* Strengthened at the top: the title now sits at the top of the
              banner, where the previous gradient was weakest. */}
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-b from-stone-900/80 via-stone-900/40 to-stone-900/55"
          />
          <Container className="relative flex flex-col items-center px-4 pb-8 pt-8 text-center sm:px-6 sm:pb-10 sm:pt-12 [&_ol]:w-fit [&_ol]:max-w-full [&_ol]:justify-center">
            <div className={breadcrumbTone}>{breadcrumb}</div>
            <h1 className="mt-2 max-w-3xl text-2xl font-bold text-white sm:text-4xl">
              {name}
            </h1>
            {/* The uncropped photo. Decorative beside the backdrop (the same
                artwork), so it carries an empty alt and no fallback: if the
                image fails, the backdrop's tile is the failure signal. The
                frame is a fixed-height box so the ring reads as one card
                whatever the photo's own aspect ratio is. */}
            <div
              id="category-hero-photo"
              className="pointer-events-none mt-6 h-36 w-full max-w-md rounded-2xl bg-white/10 p-1.5 ring-1 ring-white/40 shadow-2xl shadow-stone-950/50 sm:mt-8 sm:h-52 sm:max-w-2xl"
            >
              <ImageWithFallback
                src={category.image}
                alt=""
                fit="contain"
                loading="eager"
                renderFallback={false}
                className="h-full w-full"
              />
            </div>
          </Container>
        </section>
      ) : (
        <section className="bg-brand-900">
          <Container className="flex flex-col items-center py-12 text-center [&_ol]:w-fit [&_ol]:max-w-full [&_ol]:justify-center">
            <div className={breadcrumbTone}>{breadcrumb}</div>
            <h1 className="mt-3 max-w-3xl text-3xl font-bold text-white sm:text-4xl">
              {name}
            </h1>
          </Container>
        </section>
      )}

      <Container className="py-16">
        {hasDescription ? (
          <div className="max-w-3xl">
            <p id="category-description" className="text-stone-600">
              {description}
            </p>
          </div>
        ) : null}

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
              <li key={machine.id}>
                <MachineSummaryCard machine={machine} locale={locale} />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
