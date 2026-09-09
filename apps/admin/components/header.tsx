import { Container } from '@colina/ui';

// Admin header (app-specific — English only in Phase 3; confirm with
// Colina staff whether the admin UI should become bilingual later).
export function AdminHeader() {
  return (
    <header className="border-b border-stone-200 bg-white">
      <Container className="flex h-16 items-center">
        <span className="text-lg font-bold text-brand-800">Colina Admin</span>
      </Container>
    </header>
  );
}
