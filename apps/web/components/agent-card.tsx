import { getTranslations } from 'next-intl/server';
import { telHref } from '@/lib/contact';
import { ImageWithFallback } from './image-with-fallback';
import type { AgentContact } from '@/lib/agents';

// The same underlined text-link token `contact-info.tsx` uses for its
// phone/email values, so a contact inside an agent card behaves and reads
// exactly like one on the contact page.
const valueLinkClasses =
  'rounded font-medium text-stone-900 underline-offset-4 hover:text-brand-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

type AgentCardProps = {
  agent: AgentContact;
  locale: 'ar' | 'en';
};

/**
 * One agent inside its country section.
 *
 * The logo reuses the partner treatment: a fixed-height tile with the artwork
 * fitted `contain`, because a logo's aspect ratio is its content and cropping
 * one amputates the wordmark. With no logo (or an image that fails to load)
 * `ImageWithFallback` paints the initial-letter tile instead.
 *
 * The headline is the agent's name; a legacy row created before names existed
 * falls back to its city and then its country, so every card still has an
 * identifiable title. The line under it is the location — and for a nameless
 * row, whose headline already IS the city, the country takes that slot.
 * `h-full` keeps the cards in one grid row level even when only some of them
 * carry an address or a website.
 */
export async function AgentCard({ agent, locale }: AgentCardProps) {
  const t = await getTranslations('ContactInfo');
  const name = locale === 'ar' ? agent.nameAr : agent.nameEn;
  const city = locale === 'ar' ? agent.cityAr : agent.cityEn;
  const country = locale === 'ar' ? agent.countryAr : agent.countryEn;
  const address = locale === 'ar' ? agent.addressAr : agent.addressEn;

  const headline = name ?? city ?? country;
  const location = name !== null ? (city ?? country) : city !== null ? country : null;

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex h-24 items-center justify-center border-b border-stone-100 bg-white p-4">
        <ImageWithFallback src={agent.logoUrl} alt={headline} fit="contain" />
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="text-base font-semibold text-stone-900 [overflow-wrap:anywhere]">
          {headline}
        </h3>
        {location !== null ? (
          <p className="mt-1 text-sm text-stone-500 [overflow-wrap:anywhere]">
            {location}
          </p>
        ) : null}
        <div className="mt-3 flex flex-1 flex-col gap-3 text-sm">
          {address ? (
            <div>
              <p className="text-xs font-medium text-stone-500">
                {t('address')}
              </p>
              {/* A street address is display text: the page language fixes the
                  paragraph direction, so nothing is pinned LTR here — only the
                  phone number, the email and the website host are. */}
              <p className="mt-0.5 text-stone-700">{address}</p>
            </div>
          ) : null}
          {agent.phone ? (
            <div>
              <p className="text-xs font-medium text-stone-500">{t('phone')}</p>
              {/* `tel:` values are digits plus the stored formatting; the
                  visible text stays as stored and is isolated LTR, so an RTL
                  page cannot split or reverse it. */}
              <a href={telHref(agent.phone)} className={valueLinkClasses}>
                <span dir="ltr" className="colina-ltr-isolate block mt-0.5">
                  {agent.phone}
                </span>
              </a>
            </div>
          ) : null}
          {agent.email ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500">
                {t('email')}
              </p>
              <a
                href={`mailto:${agent.email}`}
                className={`${valueLinkClasses} [overflow-wrap:anywhere]`}
              >
                <span
                  dir="ltr"
                  className="colina-ltr-isolate [overflow-wrap:anywhere] mt-0.5 block"
                >
                  {agent.email}
                </span>
              </a>
            </div>
          ) : null}
          {agent.websiteUrl !== null && agent.websiteHost !== null ? (
            <div className="min-w-0">
              <p className="text-xs font-medium text-stone-500">
                {t('website')}
              </p>
              {/* The visible text is the host, not the full URL: it is what a
                  visitor recognises, and it cannot stretch the card. The link
                  opens in a new tab with `noopener noreferrer`, and the full
                  host in the accessible name makes several cards on one page
                  distinguishable to a screen reader. */}
              <a
                href={agent.websiteUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${t('website')}: ${agent.websiteHost}`}
                className={`${valueLinkClasses} [overflow-wrap:anywhere]`}
              >
                <span
                  dir="ltr"
                  className="colina-ltr-isolate [overflow-wrap:anywhere] mt-0.5 block"
                >
                  {agent.websiteHost}
                </span>
              </a>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
