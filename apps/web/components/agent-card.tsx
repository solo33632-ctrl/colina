import { getTranslations } from 'next-intl/server';
import { telHref } from '@/lib/contact';
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
 * One agent as a text card inside its country section.
 *
 * The Agent model carries no photo and no website (Stage 37a reported both
 * missing; the stage forbids schema changes), so the card is intentionally
 * text-only — no `Image` slot to fill and no external domains to vet.
 * The card's title is the agent's city (falling back to the country name for
 * the rare city-less row): the country — the section heading above it — is
 * already on screen, so the city is the piece of information a visitor scans
 * for. `h-full` keeps the cards in one grid row level even when only some of
 * them carry an address.
 */
export async function AgentCard({ agent, locale }: AgentCardProps) {
  const t = await getTranslations('ContactInfo');
  const city = locale === 'ar' ? agent.cityAr : agent.cityEn;
  const country = locale === 'ar' ? agent.countryAr : agent.countryEn;
  const address = locale === 'ar' ? agent.addressAr : agent.addressEn;

  return (
    <div className="flex h-full flex-col rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <h3 className="text-base font-semibold text-stone-900">
        {city ?? country}
      </h3>
      <div className="mt-3 flex flex-1 flex-col gap-3 text-sm">
        {address ? (
          <div>
            <p className="text-xs font-medium text-stone-500">
              {t('address')}
            </p>
            {/* A street address is display text: the page language fixes the
                paragraph direction, so nothing is pinned LTR here — only the
                phone number and the email are. */}
            <p className="mt-0.5 text-stone-700">{address}</p>
          </div>
        ) : null}
        {agent.phone ? (
          <div>
            <p className="text-xs font-medium text-stone-500">{t('phone')}</p>
            {/* `tel:` values are digits plus the stored formatting; the visible
                text stays as stored and is isolated LTR, so an RTL page cannot
                split or reverse it. */}
            <a href={telHref(agent.phone)} className={valueLinkClasses}>
              <span dir="ltr" className="colina-ltr-isolate block mt-0.5">
                {agent.phone}
              </span>
            </a>
          </div>
        ) : null}
        {agent.email ? (
          <div className="min-w-0">
            <p className="text-xs font-medium text-stone-500">{t('email')}</p>
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
      </div>
    </div>
  );
}
