import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { Button, Container } from '@colina/ui';
import { getPathname } from '@/i18n/navigation';

// 404s are never indexable, and they must not inherit the layout's canonical
// (which points at the home page) — `canonical: null` drops it.
export async function generateMetadata(): Promise<Metadata> {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'NotFound' });
  return {
    title: t('title'),
    description: t('description'),
    robots: { index: false, follow: false },
    alternates: { canonical: null },
  };
}

// Rendered inside `app/[locale]/layout.tsx`, so the header, footer and
// language context are all present. Every page-level `notFound()` in the
// locale tree lands here.
export default async function NotFound() {
  const locale = await getLocale();
  const t = await getTranslations({ locale, namespace: 'NotFound' });
  const home = getPathname({ locale, href: '/' });
  const products = getPathname({ locale, href: '/categories' });
  const contact = getPathname({ locale, href: '/contact' });

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-brand-700">
          404
        </p>
        <h1 className="mt-3 text-3xl font-bold text-stone-900 sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-4 max-w-xl text-stone-600">{t('description')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button href={home} size="lg">
            {t('home')}
          </Button>
          <Button href={products} variant="secondary" size="lg">
            {t('products')}
          </Button>
          <Button href={contact} variant="secondary" size="lg">
            {t('contact')}
          </Button>
        </div>
      </Container>
    </main>
  );
}
