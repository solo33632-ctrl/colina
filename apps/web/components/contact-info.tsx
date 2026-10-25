import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';
import { sanitizeMapsUrl, telHref } from '@/lib/contact';

type ContactInfoProps = {
  /** Current-locale address, already resolved by the page. */
  address: string | null;
  /** Current-locale working hours, already resolved by the page. */
  hours: string | null;
  phone: string | null;
  email: string | null;
  mapsUrl: string | null;
  whatsappNumber: string | null;
  whatsappHref: string | null;
};

/** Soft brand-tinted square behind a decorative row icon. */
function IconFrame({ children }: { children: ReactNode }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-700">
      {children}
    </span>
  );
}

function PinIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 4.18 2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92Z" />
    </svg>
  );
}

function ChatIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5Z" />
    </svg>
  );
}

function EnvelopeIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-5 w-5"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

const valueLinkClasses =
  'rounded font-medium text-stone-900 underline-offset-4 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

const mapsLinkClasses =
  'mt-2 inline-block rounded text-sm font-semibold text-brand-700 underline-offset-4 hover:text-brand-800 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

/**
 * The "Contact info" column beside the contact form.
 *
 * A server component with no client JavaScript and no animation. Every row is
 * rendered only when the admin has saved that detail; if nothing is saved the
 * component renders nothing, which lets the page fall back to a single centred
 * form. The page resolves the locale fallback for address and hours, so this
 * component never shows both languages.
 */
export async function ContactInfo({
  address,
  hours,
  phone,
  email,
  mapsUrl,
  whatsappNumber,
  whatsappHref,
}: ContactInfoProps) {
  const t = await getTranslations('ContactInfo');
  const whatsapp = await getTranslations('Whatsapp');
  const maps = sanitizeMapsUrl(mapsUrl);
  const hasWhatsapp = Boolean(whatsappNumber && whatsappHref);

  if (!address && !hours && !phone && !email && !hasWhatsapp) {
    return null;
  }

  return (
    <section
      data-testid="contact-info"
      aria-labelledby="contact-info-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm lg:mt-8"
    >
      <h2
        id="contact-info-heading"
        className="text-xl font-bold text-stone-900"
      >
        {t('heading')}
      </h2>

      <dl className="mt-6 grid gap-6">
        {address ? (
          <div data-testid="contact-info-address" className="flex gap-4">
            <IconFrame>
              <PinIcon />
            </IconFrame>
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-stone-500">
                {t('address')}
              </dt>
              <dd
                dir="auto"
                className="mt-1 whitespace-pre-line text-stone-800"
              >
                {address}
              </dd>
              {maps ? (
                <a
                  href={maps}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={mapsLinkClasses}
                >
                  {t('openInMaps')}
                </a>
              ) : null}
            </div>
          </div>
        ) : null}

        {phone ? (
          <div data-testid="contact-info-phone" className="flex gap-4">
            <IconFrame>
              <PhoneIcon />
            </IconFrame>
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-stone-500">
                {t('phone')}
              </dt>
              <dd className="mt-1">
                <a href={telHref(phone)} className={valueLinkClasses}>
                  <span dir="ltr" className="colina-ltr-isolate">
                    {phone}
                  </span>
                </a>
              </dd>
            </div>
          </div>
        ) : null}

        {whatsappNumber && whatsappHref ? (
          <div data-testid="whatsapp-contact-row" className="flex gap-4">
            <IconFrame>
              <ChatIcon />
            </IconFrame>
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-stone-500">
                {whatsapp('contactLabel')}
              </dt>
              <dd className="mt-1">
                <a
                  href={whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={valueLinkClasses}
                >
                  <span dir="ltr" className="colina-ltr-isolate">
                    +{whatsappNumber}
                  </span>
                </a>
              </dd>
            </div>
          </div>
        ) : null}

        {email ? (
          <div data-testid="contact-info-email" className="flex gap-4">
            <IconFrame>
              <EnvelopeIcon />
            </IconFrame>
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-stone-500">
                {t('email')}
              </dt>
              <dd className="mt-1 min-w-0 break-words">
                <a
                  href={`mailto:${email}`}
                  className={`${valueLinkClasses} [overflow-wrap:anywhere]`}
                >
                  <span
                    dir="ltr"
                    className="colina-ltr-isolate [overflow-wrap:anywhere]"
                  >
                    {email}
                  </span>
                </a>
              </dd>
            </div>
          </div>
        ) : null}

        {hours ? (
          <div data-testid="contact-info-hours" className="flex gap-4">
            <IconFrame>
              <ClockIcon />
            </IconFrame>
            <div className="min-w-0 flex-1">
              <dt className="text-sm font-medium text-stone-500">
                {t('hours')}
              </dt>
              <dd
                dir="auto"
                className="mt-1 whitespace-pre-line text-stone-800"
              >
                {hours}
              </dd>
            </div>
          </div>
        ) : null}
      </dl>
    </section>
  );
}
