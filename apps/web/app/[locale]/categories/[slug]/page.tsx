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

      {/* The category photo, shown whole, under a neutral scrim, with the
          category name centred over it and the breadcrumb beneath.

          The photo is the page's subject, not its wallpaper: it is the largest
          thing in the viewport and the LCP element, so it is fetched eagerly at
          high priority and is the ONE `<img>` on the page. It is `object-contain`
          inside a box that fills the hero, which is what guarantees the whole
          machine is visible for any upload — a 400x900 portrait and a 1600x500
          panorama both letterbox rather than lose their ends.

          The `bg-white` behind the photo is deliberate, not a default: the scrim
          is `bg-black/60`, so white photo-area and white letterbox-area darken
          to exactly the same neutral and the join between them disappears. The
          tile below had the same idea in reverse, where the white page shows
          through so a photo that does not fill its square blends in.

          Height is a `min-height`, not a height: the hero grows with the photo
          and the title but never shrinks below a comfortable band, and because
          it is declared in `rem` it does not stretch on an ultra-wide screen.
          The old red gradient band, its diagonal pattern, its radial highlight
          and the machine-count pill are gone — the photo carries the hero now,
          and the count still sits beside "Machines in this category" below. */}
      <section
        id="category-hero"
        className="relative isolate flex min-h-[18rem] items-center overflow-hidden bg-white md:min-h-[28rem] xl:min-h-[30rem]"
      >
        {category.image ? (
          <>
            {/* `absolute inset-0 h-full w-full` with the padding ON the image:
                Tailwind's preflight sets `box-sizing: border-box`, so `py-4`
                is carved out of the element's height and `object-contain` fits
                the photo inside what is left — the picture keeps a margin from
                the hero's top and bottom without a wrapper element in between.
                `sizes="100vw"` is exact: the image is as wide as the viewport
                and is never re-requested. */}
            <ImageWithFallback
              id="category-hero-photo"
              src={category.image}
              alt=""
              fit="contain"
              loading="eager"
              fetchPriority="high"
              sizes="100vw"
              renderFallback={false}
              className="absolute inset-0 h-full w-full py-4 sm:py-6"
            />
            {/* One flat scrim over everything, so the title reads the same over
                a bright studio shot and a dark night shot alike. */}
            <div aria-hidden="true" className="absolute inset-0 bg-black/60" />
          </>
        ) : (
          // No photo: the same band in a solid dark field, same height, same
          // centred title — a category without artwork must not look broken.
          <div aria-hidden="true" className="absolute inset-0 bg-stone-800" />
        )}

        <Container className="relative flex w-full flex-col items-center px-4 py-16 text-center sm:px-6">
          {/* The title is the only in-flow child, so it sits exactly on the
              hero's centre. The breadcrumb hangs below it out of flow: in flow
              it would push the heading one half-breadcrumb above centre, which
              is visible on a short hero. `inset-x-0` + a centred `ol` wraps the
              trail on a 390px screen without any translate or fixed width. */}
          <div className="relative flex max-w-full flex-col items-center">
            <h1 className="max-w-4xl text-balance text-3xl font-semibold text-white drop-shadow-[0_2px_8px_rgba(0,0,0,0.55)] sm:text-5xl">
              {name}
            </h1>
            <div className="absolute inset-x-0 top-full mt-3 px-4 [&_a]:underline [&_a:hover]:underline-offset-2 [&_ol]:justify-center [&_ol]:text-white/80 [&_span[aria-current]]:text-white">
              {breadcrumb}
            </div>
          </div>
        </Container>
      </section>

      <Container className="py-16">
        {/* The description lives here now, once. It used to be repeated inside
            the hero band and again below it, which meant two elements sharing
            `id="category-description"` — invalid HTML, and an ambiguous id for
            both tests and assistive tech. The hero is the photo and the title;
            the prose belongs in the page body, where it has room to be read at
            a comfortable measure instead of being stacked under a heading. */}
        {hasDescription ? (
          <p id="category-description" className="max-w-3xl leading-relaxed">
            {description}
          </p>
        ) : null}

        <Reveal className={hasDescription ? 'mt-12' : undefined}>
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="text-xl font-semibold text-stone-900">
              {t('machinesHeading')}
            </h2>
            {/* The machine count kept its place beside this heading when the
                hero's count pill went. */}
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
