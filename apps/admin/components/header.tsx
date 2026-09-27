import { Link } from '@/i18n/navigation';
import { Container } from '@colina/ui';
import { getAdminSession } from '@/lib/auth';
import { AdminLanguageSwitcher } from './language-switcher';
import { LogoutButton } from './logout-button';

// Admin header: section nav, a logout action and the language switcher —
// the last two only when a session exists, so the login page stays clean.
export async function AdminHeader() {
  const session = await getAdminSession();

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-6">
        <Link
          href="/"
          className="rounded text-lg font-bold text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          Colina Admin
        </Link>
        {session ? (
          <>
            <nav aria-label="Admin sections">
              <ul className="flex flex-wrap items-center gap-4">
                <li>
                  <Link
                    href="/categories"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Categories
                  </Link>
                </li>
                <li>
                  <Link
                    href="/machines"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Machines
                  </Link>
                </li>
                <li>
                  <Link
                    href="/partners"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Partners
                  </Link>
                </li>
                <li>
                  <Link
                    href="/services"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Services
                  </Link>
                </li>
                <li>
                  <Link
                    href="/news"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    News
                  </Link>
                </li>
                <li>
                  <Link
                    href="/agents"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Agents
                  </Link>
                </li>
                <li>
                  <Link
                    href="/leads"
                    className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    Leads
                  </Link>
                </li>
                {session.user.role === 'SUPER_ADMIN' ? (
                  <li>
                    <Link
                      href="/audit-log"
                      className="rounded text-sm text-stone-600 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      Audit Log
                    </Link>
                  </li>
                ) : null}
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
