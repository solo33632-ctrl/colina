import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumb } from '@/components/breadcrumb';
import { MaintenanceMachineCard } from '@/components/maintenance-machine-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { routing } from '@/i18n/routing';
import { getMaintenanceLine } from '@/lib/maintenance';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; slug: string }>;
};

export async function generateStaticParams() {
  const lines = await prisma.maintenanceCategory.findMany({
    select: { slug: true },
  });
  return lines.map((line) => ({ slug: line.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const line = await prisma.maintenanceCategory.findUnique({
    where: { slug },
  });
  if (!line) {
    return {};
  }
  return {
    title: locale === 'ar' ? line.nameAr : line.nameEn,
    description:
      (locale === 'ar' ? line.descriptionAr : line.descriptionEn) ?? undefined,
    alternates: await localeAlternates(`/maintenance/${slug}`, locale),
  };
}

export default async function MaintenanceLinePage({ params }: Props) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const pages = await getTranslations('MaintenancePages');
  const nav = await getTranslations('Nav');
  const line = await getMaintenanceLine(slug);

  if (!line) {
    notFound();
  }

  const name = locale === 'ar' ? line.nameAr : line.nameEn;
  const description = locale === 'ar' ? line.descriptionAr : line.descriptionEn;
  const hasDescription = (description ?? '').trim().length > 0;

  return (
    <main>
      <PageViewTracker path={`/maintenance/${slug}`} locale={locale} />

      {/* The line's title band. No photo: a production line's cover belongs on
          its tile, and the machines below are the page's subject. The band is
          the same dark field the photo-less category hero uses, so a line with
          no artwork does not look like a different kind of page. */}
      <section className="bg-stone-800">
        <Container className="flex flex-col items-center px-4 py-16 text-center sm:px-6">
          <h1 className="max-w-4xl text-balance text-3xl font-semibold text-white sm:text-5xl">
            {name}
          </h1>
          <div className="mt-4 [&_a]:text-white [&_a]:underline [&_a:hover]:underline-offset-2 [&_ol]:justify-center [&_ol]:text-white/80 [&_span[aria-current]]:text-white">
            <Breadcrumb
              label={pages('breadcrumbLabel')}
              items={[
                { label: nav('home'), href: '/' },
                { label: pages('maintenanceCrumb'), href: '/maintenance' },
                { label: name },
              ]}
            />
          </div>
        </Container>
      </section>

      <Container className="py-16">
        {hasDescription ? (
          <p className="max-w-3xl leading-relaxed text-stone-600">
            {description}
          </p>
        ) : null}

        <div
          className={`flex flex-wrap items-baseline justify-between gap-3 ${
            hasDescription ? 'mt-12' : ''
          }`}
        >
          <h2 className="text-xl font-semibold text-stone-900">
            {pages('lineMachinesHeading')}
          </h2>
          <p className="text-sm text-stone-500">
            {pages('machineCount', { count: line.items.length })}
          </p>
        </div>

        {line.items.length === 0 ? (
          <p className="mt-6 rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-500">
            {pages('lineEmpty')}
          </p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {line.items.map((item) => (
              <li key={item.id} className="h-full">
                <MaintenanceMachineCard
                  item={item}
                  lineSlug={line.slug}
                  locale={locale}
                  // One image in a third of the content container: at most
                  // ~23rem wide, rendered at 1x or 2x.
                  sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                />
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
