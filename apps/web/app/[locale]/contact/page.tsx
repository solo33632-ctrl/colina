import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container } from '@colina/ui';
import { ContactForm } from '@/components/contact-form';
import { FactoryLocation } from '@/components/factory-location';
import { PageViewTracker } from '@/components/page-view-tracker';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';
import { getSiteSettings } from '@/lib/site-settings';
import { buildWhatsappUrl } from '@/lib/whatsapp';

// Static page reusing the shared ContactForm — submission wiring is Phase 8.
// The WhatsApp row is the one DB-driven part, so it follows the site's hourly
// freshness window like every other DB-backed page.
export const revalidate = 3600;

type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'ContactPage' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/contact', locale),
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const [t, whatsapp] = await Promise.all([
    getTranslations('ContactPage'),
    getTranslations('Whatsapp'),
  ]);

  // Same cached read as the layout, and the same locale fallback: a blank
  // stored greeting becomes the standard one, and an invalid/missing number
  // renders neither the row nor the floating button.
  const settings = await getSiteSettings();
  const storedMessage =
    locale === 'ar' ? settings.whatsappMessageAr : settings.whatsappMessageEn;
  const whatsappHref = settings.whatsappNumber
    ? buildWhatsappUrl(
        settings.whatsappNumber,
        storedMessage?.trim() || whatsapp('defaultMessage')
      )
    : null;

  return (
    <main>
      <PageViewTracker path="/contact" locale={locale} />
      <Container className="py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
        {whatsappHref ? (
          <div
            data-testid="whatsapp-contact-row"
            className="mx-auto mt-6 max-w-md rounded-xl border border-stone-200 bg-white px-5 py-4"
          >
            <dl className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <dt className="text-sm font-medium text-stone-600">
                {whatsapp('contactLabel')}
              </dt>
              <dd>
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded text-sm font-semibold text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <span dir="ltr" className="colina-ltr-isolate">
                    +{settings.whatsappNumber}
                  </span>
                </a>
              </dd>
            </dl>
          </div>
        ) : null}
        <ContactForm />
      </Container>
      {/* Replaces the illustrative OSM placeholder that used to sit here. The
          same component is the last section of the home page. */}
      <FactoryLocation locale={locale} />
    </main>
  );
}
