import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';

// Brand bar for the unauthenticated screens (login / forgot password / reset
// password). Those pages are the only ones reachable without a session, so
// they keep a plain header instead of the admin shell.
export async function AuthHeader() {
  const t = await getTranslations('Nav');

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center">
        <Link
          href="/"
          className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Image
            src="/logo.png"
            alt={t('brand')}
            width={773}
            height={534}
            priority
            className="h-10 w-auto"
          />
        </Link>
      </Container>
    </header>
  );
}
