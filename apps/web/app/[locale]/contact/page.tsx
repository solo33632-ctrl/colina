import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container } from '@colina/ui';
import { ContactForm } from '@/components/contact-form';
import { routing } from '@/i18n/routing';

// Static page reusing the shared ContactForm — submission wiring is Phase 8.
// No DB read, so no `revalidate` needed.
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
  };
}

export default async function ContactPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('ContactPage');

  return (
    <main>
      <Container className="py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
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
