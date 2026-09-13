import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { routing } from '@/i18n/routing';
import { localeAlternates } from '@/lib/seo';

// Static placeholder copy — no DB read, so no `revalidate` needed.
// Real copy arrives with Phase 0 content.
type Props = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'AboutPage' });
  return {
    title: t('heading'),
    description: t('intro1'),
    alternates: await localeAlternates('/about', locale),
  };
}

export default async function AboutPage({ params }: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // Enable static rendering (see `i18n/request.ts` for why this call exists).
  setRequestLocale(locale);

  const t = await getTranslations('AboutPage');

  return (
    <main>
      <Container className="max-w-3xl py-16">
        <h1 className="text-center text-2xl font-bold text-stone-900 sm:text-3xl">
          {t('heading')}
        </h1>
        <p className="mt-6 text-stone-600">{t('intro1')}</p>
        <p className="mt-4 text-stone-600">{t('intro2')}</p>
        <Card
          className="mt-8"
          title={t('missionTitle')}
          description={t('missionText')}
        />
      </Container>
    </main>
  );
}
