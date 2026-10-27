import { getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getSiteSettings } from '@/lib/site-settings';
import { buildWhatsappUrl } from '@/lib/whatsapp';

type Locale = (typeof routing.locales)[number];

type ContactCtaBandProps = {
  locale: Locale;
};

/**
 * The compact closing band on the home page.
 *
 * Server-rendered and static-friendly: no form, no client JavaScript, no
 * animation. The WhatsApp button appears only when the stored number is
 * usable, and it uses the same greeting fallback as the floating button.
 */
export async function ContactCtaBand({ locale }: ContactCtaBandProps) {
  const t = await getTranslations('ContactCta');
  const whatsapp = await getTranslations('Whatsapp');
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
    <section
      aria-labelledby="contact-cta-heading"
      data-testid="contact-cta"
      className="border-t border-stone-200 bg-white"
    >
      <Container className="py-12 sm:py-14">
        <div className="mx-auto max-w-2xl text-center">
          <h2
            id="contact-cta-heading"
            className="text-2xl font-bold text-stone-900 sm:text-3xl"
          >
            {t('heading')}
          </h2>
          <p className="mt-3 text-stone-600">{t('body')}</p>
          <div className="mt-6 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button
              href={getPathname({ href: '/contact', locale })}
              size="lg"
              className="w-full sm:w-auto"
            >
              {t('primary')}
              <svg
                aria-hidden="true"
                focusable="false"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="ms-2 h-4 w-4 shrink-0 rtl:[transform:scaleX(-1)]"
              >
                <path d="M4 12h15" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </Button>
            {whatsappHref ? (
              <Button
                href={whatsappHref}
                variant="secondary"
                size="lg"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full sm:w-auto"
              >
                {t('whatsapp')}
              </Button>
            ) : null}
          </div>
        </div>
      </Container>
    </section>
  );
}
