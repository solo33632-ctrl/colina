'use client';

import { useTranslations } from 'next-intl';
import { Button, Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';

type ErrorPageProps = {
  /** Next passes the thrown error; it is intentionally never rendered. */
  error: Error & { digest?: string };
  reset: () => void;
};

// Client error boundary for the whole public site. Only friendly, translated
// copy is shown — no message, stack or digest from the thrown error reaches
// the visitor. `reset` retries the failed segment.
export default function ErrorPage({ reset }: ErrorPageProps) {
  const t = useTranslations('ErrorPage');

  return (
    <main id="main-content" tabIndex={-1} className="outline-none">
      <Container className="flex min-h-[60vh] flex-col items-center justify-center py-20 text-center">
        <h1 className="text-3xl font-bold text-stone-900 sm:text-4xl">
          {t('title')}
        </h1>
        <p className="mt-4 max-w-xl text-stone-600">{t('description')}</p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
          <Button type="button" size="lg" onClick={() => reset()}>
            {t('retry')}
          </Button>
          <Link
            href="/"
            className="rounded text-sm font-medium text-brand-700 underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {t('home')}
          </Link>
        </div>
      </Container>
    </main>
  );
}
