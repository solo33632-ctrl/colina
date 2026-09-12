import { Container } from '@colina/ui';
import { getAdminSession } from '@/lib/auth';
import { LogoutButton } from './logout-button';

// Admin header (app-specific — English only; confirm with Colina staff
// whether the admin UI should become bilingual later). Shows a logout
// action only when a session exists (so the login page stays clean).
export async function AdminHeader() {
  const session = await getAdminSession();

  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center gap-4">
        <span className="text-lg font-bold text-brand-800">Colina Admin</span>
        {session ? (
          <div className="ms-auto">
            <LogoutButton />
          </div>
        ) : null}
      </Container>
    </header>
  );
}
