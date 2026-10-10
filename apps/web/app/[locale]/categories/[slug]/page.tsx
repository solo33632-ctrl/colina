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
          placeholder hero reads as broken, not as "no photo yet". */}
      {category.image ? (
        <section className="relative isolate overflow-hidden bg-brand-900">
          <ImageWithFallback
            src={category.image}
            alt=""
            className="h-64 w-full object-cover sm:h-80"
            fallbackClassName="bg-brand-900"
          />
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-gradient-to-t from-stone-900/85 via-stone-900/50 to-stone-900/30"
          />
          <Container className="absolute inset-0 flex flex-col justify-end py-10">
            <div className={breadcrumbTone}>{breadcrumb}</div>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {name}
            </h1>
          </Container>
        </section>
      ) : (
        <section className="bg-brand-900">
          <Container className="py-12">
            <div className={breadcrumbTone}>{breadcrumb}</div>
            <h1 className="mt-3 text-3xl font-bold text-white sm:text-4xl">
              {name}
            </h1>
          </Container>
        </section>
      )}

      <Container className="py-16">
        <div className="max-w-3xl">
          <p className="text-stone-600">{description}</p>
        </div>

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
