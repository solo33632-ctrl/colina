import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { routing } from '@/i18n/routing';

// Placeholder draft only — must be reviewed by a lawyer before go-live.
// No DB read, so no `revalidate` needed.
type Props = {
  params: Promise<{ locale: string }>;
};

const SECTIONS = [
  'collected',
  'cookies',
  'trackers',
  'contact',
  'changes',
] as const;

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'PrivacyPage' });
  return {
    title: t('heading'),
    description: t('draftText'),
  };
}

export default async function PrivacyPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('PrivacyPage');

  return (
    <main>
      <Container className="max-w-3xl py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <Card
          className="mt-8 border-amber-300 bg-amber-50"
          title={t('draftTitle')}
          description={t('draftText')}
        />
        {SECTIONS.map((section) => (
          <section key={section} className="mt-8">
            <h2 className="text-lg font-semibold text-stone-900">
              {t(`${section}Title`)}
            </h2>
            <p className="mt-1 text-stone-600">{t(`${section}Text`)}</p>
          </section>
        ))}
      </Container>
    </main>
  );
}
