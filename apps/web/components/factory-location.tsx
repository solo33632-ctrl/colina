import { getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import {
  buildMapEmbedUrl,
  resolveCoordinates,
  resolveMapLinks,
} from '@/lib/location';
import { getSiteSettings } from '@/lib/site-settings';

type FactoryLocationProps = {
  locale: 'ar' | 'en';
};

/** Decorative pin. The label beside it carries the meaning. */
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
      className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
    >
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

/** Decorative clock. The label beside it carries the meaning. */
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
      className="mt-0.5 h-5 w-5 shrink-0 text-brand-600"
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

/**
 * "Visit our factory": address, working hours, directions and the embedded
 * map, all driven by the admin's SiteSettings row.
 *
 * A server component with no client JavaScript and no animation. The whole
 * section renders nothing when the row has no coordinates, address or hours,
 * so an unconfigured site never shows an empty heading or a placeholder map.
 *
 * The current locale's text wins; the other language is a fallback only when
 * the current one is blank. The map and both buttons are independent: a row
 * with only an address still shows the card, a row with only a stored Maps
 * link still shows the open button, and only a complete coordinate pair gets
 * an iframe.
 *
 * Layout is a logical grid: the info card is first in DOM order, which puts it
 * on the START side in both directions (left in English, right in Arabic), and
 * the map fills the END column. Below `lg` the two stack, card first.
 */
export async function FactoryLocation({ locale }: FactoryLocationProps) {
  const settings = await getSiteSettings();

  const address =
    locale === 'ar'
      ? (settings.factoryAddressAr ?? settings.factoryAddressEn)
      : (settings.factoryAddressEn ?? settings.factoryAddressAr);
  const hours =
    locale === 'ar'
      ? (settings.workingHoursAr ?? settings.workingHoursEn)
      : (settings.workingHoursEn ?? settings.workingHoursAr);
  const coordinates = resolveCoordinates(settings.latitude, settings.longitude);

  if (!coordinates && !address && !hours) {
    return null;
  }

  const t = await getTranslations('Factory');
  const { directionsHref, openHref } = resolveMapLinks(settings);
  const mapSrc = coordinates
    ? buildMapEmbedUrl(coordinates.lat, coordinates.lng, locale)
    : null;

  return (
    <section
      id="location"
      aria-labelledby="location-heading"
      data-testid="factory-location"
      className="border-t border-stone-200 bg-white"
    >
      <Container className="py-16">
        <h2
          id="location-heading"
          className="text-center text-2xl font-bold text-stone-900 sm:text-3xl"
        >
          {t('heading')}
        </h2>

        <div
          className={`mt-8 grid gap-8 ${
            mapSrc ? 'lg:grid-cols-2 lg:items-stretch' : 'mx-auto max-w-2xl'
          }`}
        >
          <div
            data-testid="factory-info"
            className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
          >
            <dl className="grid gap-5">
              {address ? (
                <div data-testid="factory-address" className="flex gap-3">
                  <PinIcon />
                  <div className="min-w-0">
                    <dt className="text-sm font-medium text-stone-500">
                      {t('address')}
                    </dt>
                    <dd
                      dir="auto"
                      className="mt-1 whitespace-pre-line text-stone-800"
                    >
                      {address}
                    </dd>
                  </div>
                </div>
              ) : null}

              {hours ? (
                <div data-testid="factory-hours" className="flex gap-3">
                  <ClockIcon />
                  <div className="min-w-0">
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

            {directionsHref || openHref ? (
              <div className="mt-6 flex flex-wrap gap-3 lg:mt-auto lg:pt-8">
                {directionsHref ? (
                  <Button
                    href={directionsHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="primary"
                  >
                    {t('directions')}
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
                ) : null}

                {openHref ? (
                  <Button
                    href={openHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    variant="secondary"
                  >
                    {t('openMap')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>

          {mapSrc ? (
            <div
              data-testid="factory-map-frame"
              className="h-80 overflow-hidden rounded-lg border border-stone-200 bg-stone-100 shadow-sm md:h-[26rem] lg:h-full lg:min-h-[26rem]"
            >
              <iframe
                data-testid="factory-map"
                title={t('mapTitle')}
                src={mapSrc}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
                className="h-full w-full border-0"
              />
            </div>
          ) : null}
        </div>
      </Container>
    </section>
  );
}
