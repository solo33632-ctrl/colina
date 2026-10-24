import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container } from '@colina/ui';
import { ContactForm } from '@/components/contact-form';
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
        <section
          aria-labelledby="map-heading"
          className="mx-auto mt-12 max-w-3xl"
        >
          <h2
            id="map-heading"
            className="text-center text-lg font-semibold text-stone-900"
          >
            {t('mapTitle')}
          </h2>
          {/* Illustrative OpenStreetMap embed centered on Cairo (no API key,
              no external script). Replace with the real address in Phase 0. */}
          <iframe
            title={t('mapTitle')}
            src="https://www.openstreetmap.org/export/embed.html?bbox=31.0850%2C29.9245%2C31.3864%2C30.1644&layer=mapnik&marker=30.0444%2C31.2357"
            className="mt-4 h-80 w-full rounded-xl border border-stone-200"
            loading="lazy"
          />
          <p className="mt-2 text-center text-sm text-stone-500">
            {t('mapNote')}
          </p>
        </section>
      </Container>
    </main>
  );
}
