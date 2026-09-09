import { Container } from '@colina/ui';

// Admin footer (app-specific — English only in Phase 3).
export function AdminFooter() {
  return (
    <footer className="border-t border-stone-200 bg-white">
      <Container className="py-6">
        <p className="text-center text-sm text-stone-500">
          © {new Date().getFullYear()} Colina Admin — internal use only.
        </p>
      </Container>
    </footer>
  );
}
