import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Card, Container } from '@colina/ui';
import { MaintenanceRequestForm } from '@/components/maintenance-request-form';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// Interim freshness: revalidate DB-driven content hourly (see agent.md).
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'ServicesPage' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/services', locale),
  };
}

export default async function ServicesPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('ServicesPage');
  const formT = await getTranslations('MaintenanceForm');
  const services = await prisma.maintenanceService.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        {services.length === 0 ? (
          <p className="mt-8 text-center text-stone-500">{t('empty')}</p>
        ) : (
          <ul className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {services.map((service) => {
              const title = locale === 'ar' ? service.titleAr : service.titleEn;
              const description =
                locale === 'ar' ? service.descriptionAr : service.descriptionEn;
              const scope = locale === 'ar' ? service.scopeAr : service.scopeEn;
              const initial = title.trim().charAt(0).toLocaleUpperCase();
              return (
                <li key={service.id}>
                  <Card className="h-full">
                    <div
                      aria-hidden="true"
                      className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-brand-100"
                    >
                      <span className="text-xl font-bold text-brand-800">
                        {initial}
                      </span>
                    </div>
                    <h2 className="text-lg font-semibold text-stone-900">
                      {title}
                    </h2>
                    <p className="mt-1 text-sm text-stone-600">{description}</p>
                    <p className="mt-3 text-sm text-stone-600">
                      <span className="font-medium text-stone-800">
                        {t('scopeLabel')}:
                      </span>{' '}
                      {scope}
                    </p>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </Container>
      <section
        aria-labelledby="maintenance-form-heading"
        className="border-t border-stone-200 bg-white"
      >
        <Container className="py-16">
          <h2
            id="maintenance-form-heading"
            className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {formT('heading')}
          </h2>
          <p className="mt-2 text-center text-stone-600">
            {formT('subheading')}
          </p>
          <MaintenanceRequestForm />
        </Container>
      </section>
    </main>
  );
}
