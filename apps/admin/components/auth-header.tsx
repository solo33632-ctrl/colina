import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import type { AdminTheme } from '@/lib/theme';
import { ThemeToggle } from './theme-toggle';

// Brand bar for the unauthenticated screens (login / forgot password / reset
// password). Those pages are the only ones reachable without a session, so
// they keep a plain header instead of the admin shell.
export async function AuthHeader({ theme }: { theme: AdminTheme }) {
  const t = await getTranslations('Nav');

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center">
        <Link
          href="/"
          className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {/* The wordmark is dark artwork: a constant light plate keeps it
              readable on the dark header. The negative margin means the plate
              adds no layout size, and on the light theme it is invisible. */}
          <span
            data-plate="true"
            className="-m-1 inline-flex rounded-lg bg-plate p-1"
          >
            <Image
              src="/logo.png"
              alt={t('brand')}
              width={773}
              height={534}
              priority
              className="h-10 w-auto"
            />
          </span>
        </Link>
        <div className="ms-auto">
          <ThemeToggle initialTheme={theme} />
        </div>
      </Container>
    </header>
  );
}
