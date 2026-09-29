import Image from 'next/image';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { LOGO_SIZES } from '@/lib/intro';
import { LanguageSwitcher } from './language-switcher';

// Public-site header (app-specific — the admin header lives in apps/admin).
export async function SiteHeader() {
  const site = await getTranslations('Site');
  const nav = await getTranslations('Nav');
  const items = [
    { label: nav('home'), href: '/' as const },
    { label: nav('machines'), href: '/categories' as const },
    { label: nav('services'), href: '/services' as const },
    { label: nav('about'), href: '/about' as const },
    { label: nav('contact'), href: '/#contact' as const },
  ];
  // The lockup already draws the wordmark and the tagline, so the alt text
  // spells both out for assistive tech. `priority` because the logo is the
  // largest-contentful-paint candidate on every page.
  const logoAlt = `${site('name')} — ${site('tagline')}`;

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href="/"
          className="rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          <Image
            src="/logo.png"
            alt={logoAlt}
            width={773}
            height={534}
            // Shared with the home page's intro overlay so both <img>
            // elements resolve to the same /_next/image candidate and the
            // browser fetches the logo once per page load. Also far smaller
            // than the 100vw default, which was pulling a 1920px-wide variant
            // for a 70px logo. See LOGO_SIZES.
            sizes={LOGO_SIZES}
            priority
            className="h-10 w-auto sm:h-12"
          />
        </Link>
        <nav aria-label={nav('main')} className="hidden sm:block">
          <ul className="flex items-center gap-6">
            {items.map((item) => (
              <li key={item.href + item.label}>
                <Link
                  href={item.href}
                  className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="ms-auto">
          <LanguageSwitcher />
        </div>
      </Container>
    </header>
  );
}
