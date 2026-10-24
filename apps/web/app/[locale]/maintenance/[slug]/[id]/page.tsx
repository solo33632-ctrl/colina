import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Button, Container } from '@colina/ui';
import { BeforeAfterSlider } from '@/components/before-after-slider';
import { Breadcrumb } from '@/components/breadcrumb';
import { MaintenanceMachineCard } from '@/components/maintenance-machine-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import {
  getMaintenanceItem,
  getRelatedMaintenanceItems,
} from '@/lib/maintenance';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string; slug: string; id: string }>;
};

export async function generateStaticParams() {
  // Only machines that belong to a line: an orphan has no public URL at all,
  // so it must not be pre-rendered either.
  const items = await prisma.maintenanceShowcase.findMany({
    where: { categoryId: { not: null } },
    select: { id: true, category: { select: { slug: true } } },
  });
  return items.flatMap((item) =>
    item.category ? [{ slug: item.category.slug, id: item.id }] : []
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, slug, id } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const item = await getMaintenanceItem(slug, id);
  if (!item || !item.category) {
    return {};
  }
  const description = locale === 'ar' ? item.descriptionAr : item.descriptionEn;
  const lineDescription =
    locale === 'ar' ? item.category.descriptionAr : item.category.descriptionEn;
  return {
    title: locale === 'ar' ? item.nameAr : item.nameEn,
    // The machine's own copy when it has any; otherwise the line's, which is
    // still about the work this page shows. Omitted entirely when neither
    // exists rather than repeating the title as a description.
    description: description ?? lineDescription ?? undefined,
    alternates: await localeAlternates(`/maintenance/${slug}/${id}`, locale),
  };
}

export default async function MaintenanceMachinePage({ params }: Props) {
  const { locale, slug, id } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('MaintenanceShowcase');
  const pages = await getTranslations('MaintenancePages');
  const nav = await getTranslations('Nav');
  const item = await getMaintenanceItem(slug, id);

  // Unknown id, an id from another line, and an orphan with no line all land
  // here as `null` — see `getMaintenanceItem`.
  if (!item || !item.category) {
    notFound();
  }

  const name = locale === 'ar' ? item.nameAr : item.nameEn;
  const lineName =
    locale === 'ar' ? item.category.nameAr : item.category.nameEn;
  const description = locale === 'ar' ? item.descriptionAr : item.descriptionEn;
  const hasDescription = (description ?? '').trim().length > 0;

  const related = await getRelatedMaintenanceItems(item.category.id, item.id);

  // Locale-aware on purpose: a plain `/services` href would drop an English
  // visitor into the Arabic default locale. `getPathname` prefixes only when
  // the locale needs it, and the fragment still lands on the form's heading.
  const requestHref = `${await getPathname({
    locale,
    href: '/services',
  })}#maintenance-form-heading`;

  return (
    <main>
      <PageViewTracker path={`/maintenance/${slug}/${id}`} locale={locale} />
      <Container className="py-16">
        <Breadcrumb
          label={pages('breadcrumbLabel')}
          items={[
            { label: nav('home'), href: '/' },
            { label: pages('maintenanceCrumb'), href: '/maintenance' },
            { label: lineName, href: `/maintenance/${slug}` },
            { label: name },
          ]}
        />

        <div className="mx-auto mt-8 max-w-4xl">
          {/* Exactly one h1 on the page: the machine's name. The line is the
              breadcrumb's job, and the slider is the page's subject. */}
          <h1 className="text-2xl font-bold text-stone-900 sm:text-3xl">
            {name}
          </h1>

          <div className="mt-8 aspect-[4/3] overflow-hidden rounded-lg border border-stone-200 bg-stone-100 shadow-sm">
            <BeforeAfterSlider
              beforeSrc={item.beforeImageUrl}
              afterSrc={item.afterImageUrl}
              beforeAlt={t('photoAlt', { name })}
              afterAlt={t('photoAltAfter', { name })}
              beforeLabel={t('before')}
              afterLabel={t('after')}
              sliderLabel={t('compare')}
              valueTextTemplate={t.raw('valueText')}
              // The frame is at most 56rem wide and full width below that.
              sizes="(max-width: 896px) 100vw, 896px"
            />
          </div>

          {hasDescription ? (
            <p className="mt-6 whitespace-pre-line leading-relaxed text-stone-600">
              {description}
            </p>
          ) : null}

          <div className="mt-8">
            <Button href={requestHref} size="lg">
              {pages('requestMaintenance')}
            </Button>
          </div>
        </div>
      </Container>

      {related.length > 0 ? (
        <section
          aria-labelledby="more-maintenance-heading"
          className="border-t border-stone-200 bg-white"
        >
          <Container className="py-16">
            <h2
              id="more-maintenance-heading"
              className="text-xl font-semibold text-stone-900"
            >
              {pages('moreHeading')}
            </h2>
            <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {related.map((relatedItem) => (
                <li key={relatedItem.id} className="h-full">
                  <MaintenanceMachineCard
                    item={relatedItem}
                    lineSlug={slug}
                    locale={locale}
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 380px"
                  />
                </li>
              ))}
            </ul>
          </Container>
        </section>
      ) : null}
    </main>
  );
}
