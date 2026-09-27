import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Container } from '@colina/ui';
import { getAdminSession } from '@/lib/auth';
import { AdminLanguageSwitcher } from './language-switcher';
import { LogoutButton } from './logout-button';

// Admin header: section nav, a logout action and the language switcher —
// the last two only when a session exists, so the login page stays clean.
// The nav is data-driven so the labels stay in one place in the message
// files and the list cannot drift from the audit-log role gate.
export async function AdminHeader() {
  const session = await getAdminSession();
  const t = await getTranslations('Nav');

  const sections = [
    { href: '/categories', label: t('categories') },
    { href: '/machines', label: t('machines') },
    { href: '/partners', label: t('partners') },
    { href: '/services', label: t('services') },
    { href: '/news', label: t('news') },
    { href: '/agents', label: t('agents') },
    { href: '/leads', label: t('leads') },
    // SUPER_ADMIN only — the page itself re-checks with requireSuperAdmin().
    ...(session?.user.role === 'SUPER_ADMIN'
      ? [{ href: '/audit-log', label: t('auditLog') }]
      : []),
  ];

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href="/"
          className="rounded text-lg font-bold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {t('brand')}
        </Link>
        {session ? (
          <>
            <nav aria-label={t('sectionsLabel')}>
              <ul className="flex flex-wrap items-center gap-4">
                {sections.map((section) => (
                  <li key={section.href}>
                    <Link
                      href={section.href}
                      className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      {section.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="ms-auto flex items-center gap-3">
              <AdminLanguageSwitcher />
              <LogoutButton />
            </div>
          </>
        ) : null}
      </Container>
    </header>
  );
}
