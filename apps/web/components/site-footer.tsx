import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Link } from '@/i18n/navigation';

// Public-site footer (app-specific — the admin footer lives in apps/admin).
// Carries the secondary/legal links (Partners, Privacy) that don't belong
// in the tight header nav, plus the primary pages for reachability.
export async function SiteFooter() {
  const site = await getTranslations('Site');
  const nav = await getTranslations('Nav');
  const partners = await getTranslations('PartnersPage');
  const t = await getTranslations('Footer');

  const links = [
    { label: nav('about'), href: '/about' as const },
    { label: partners('heading'), href: '/partners' as const },
    { label: nav('contact'), href: '/contact' as const },
    { label: t('privacy'), href: '/privacy' as const },
  ];

  return (
    <footer className="border-t border-stone-200 bg-white">
      <Container className="py-6">
        <nav aria-label={t('linksLabel')}>
          <ul className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <p className="mt-4 text-center text-sm text-stone-500">
          © {new Date().getFullYear()} {site('name')} — {t('rights')}
        </p>
        <p className="mt-1 text-center text-xs text-stone-400">
          {site('tagline')}
        </p>
      </Container>
    </footer>
  );
}
