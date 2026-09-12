import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';

// Public-site header (app-specific — the admin header lives in apps/admin).
export async function SiteHeader() {
  const site = await getTranslations('Site');
  const nav = await getTranslations('Nav');
  const items = [
    { label: nav('home'), href: '/' as const },
    { label: nav('machines'), href: '/categories' as const },
    { label: nav('services'), href: '/services' as const },
    { label: nav('contact'), href: '/#contact' as const },
  ];

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href="/"
          className="rounded text-lg font-bold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {site('name')}
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
