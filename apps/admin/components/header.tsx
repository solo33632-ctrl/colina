import Link from 'next/link';
import { Container } from '@colina/ui';
import { getAdminSession } from '@/lib/auth';
import { LogoutButton } from './logout-button';

// Admin header (app-specific — English only; confirm with Colina staff
// whether the admin UI should become bilingual later). Shows section nav
// plus a logout action only when a session exists (so the login page
// stays clean).
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
              <ul className="flex items-center gap-4">
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
              </ul>
            </nav>
            <div className="ms-auto">
              <LogoutButton />
            </div>
          </>
        ) : null}
      </Container>
    </header>
  );
}
