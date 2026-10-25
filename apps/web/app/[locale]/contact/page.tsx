import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Container } from '@colina/ui';
import { ContactForm } from '@/components/contact-form';
import { ContactInfo } from '@/components/contact-info';
import { PageViewTracker } from '@/components/page-view-tracker';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';
import { getSiteSettings } from '@/lib/site-settings';
import { buildWhatsappUrl } from '@/lib/whatsapp';

// Static page reusing the shared ContactForm. The contact details and the
// WhatsApp row are DB-driven, so the page follows the site's hourly freshness
// window like every other DB-backed page.
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
  // renders no WhatsApp row and no floating button.
  const settings = await getSiteSettings();
  const storedMessage =
    locale === 'ar' ? settings.whatsappMessageAr : settings.whatsappMessageEn;
  const whatsappHref = settings.whatsappNumber
    ? buildWhatsappUrl(
        settings.whatsappNumber,
        storedMessage?.trim() || whatsapp('defaultMessage')
      )
    : null;

  // The current locale wins; the other language is a fallback only when the
  // current one is blank, so the info block never shows both.
  const address =
    locale === 'ar'
      ? (settings.factoryAddressAr ?? settings.factoryAddressEn)
      : (settings.factoryAddressEn ?? settings.factoryAddressAr);
  const hours =
    locale === 'ar'
      ? (settings.workingHoursAr ?? settings.workingHoursEn)
      : (settings.workingHoursEn ?? settings.workingHoursAr);

  const hasContactInfo = Boolean(
    address ||
      hours ||
      settings.contactPhone ||
      settings.contactEmail ||
      whatsappHref
  );

  return (
    <main>
      <PageViewTracker path="/contact" locale={locale} />
      <Container className="py-16">
        <div className="mx-auto max-w-5xl">
          <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
            {t('heading')}
          </h1>
          <p className="mt-2 text-center text-stone-600">{t('subheading')}</p>
          <div
            className={
              hasContactInfo
                ? 'mt-8 grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start lg:gap-10'
                : undefined
            }
          >
            {hasContactInfo ? (
              <ContactInfo
                address={address}
                hours={hours}
                phone={settings.contactPhone}
                email={settings.contactEmail}
                mapsUrl={settings.mapsUrl}
                whatsappNumber={settings.whatsappNumber}
                whatsappHref={whatsappHref}
              />
            ) : null}
            <ContactForm />
          </div>
        </div>
      </Container>
    </main>
  );
}
