import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Button, Container } from '@colina/ui';
import { AgentCard } from '@/components/agent-card';
import { PageViewTracker } from '@/components/page-view-tracker';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAgents } from '@/lib/agents';
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
  const t = await getTranslations({ locale, namespace: 'AgentsPage' });
  return {
    title: t('heading'),
    description: t('subheading'),
    alternates: await localeAlternates('/agents', locale),
  };
}

// The public agents directory: every admin-recorded agent, grouped into
// country sections in alphabetical order (the localized one), each card
// carrying the contact details an after-sales visitor needs. Data comes from
// `getAgents`, which validates every field on read — a half-edited row hides
// its unusable values instead of rendering a broken `tel:` or `mailto:` link.
export default async function AgentsPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('AgentsPage');
  const groups = await getAgents(locale);

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <PageViewTracker path="/agents" locale={locale} />
      <Container className="py-16">
        {/* The same centered heading over a brand hairline the partners
            section uses, so both DB-listing pages read as siblings. */}
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mx-auto mt-2 max-w-2xl text-center text-stone-600">
          {t('subheading')}
        </p>
        <div
          aria-hidden="true"
          className="mx-auto mt-6 h-0.5 w-16 rounded-full bg-brand-500"
        />

        {groups.length === 0 ? (
          <div className="mt-10 text-center">
            <p className="text-stone-600">{t('empty')}</p>
            <div className="mt-4">
              <Button href={getPathname({ href: '/contact', locale })}>
                {t('emptyCta')}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-12 flex flex-col gap-12">
            {groups.map((group, index) => {
              // The section heading always shows the localized country name;
              // the id only needs to be unique and stable for aria-labelledby.
              const country =
                locale === 'ar' ? group.countryAr : group.countryEn;
              const headingId = `agents-country-${index}`;
              return (
                <section key={headingId} aria-labelledby={headingId}>
                  <h2 className="text-xl font-bold text-stone-900">
                    {country}
                  </h2>
                  <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {group.agents.map((agent) => (
                      <li key={agent.id}>
                        <AgentCard agent={agent} locale={locale} />
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </Container>
    </main>
  );
}
