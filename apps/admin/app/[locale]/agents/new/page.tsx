import { Container } from '@colina/ui';
import { AgentForm } from '@/components/agent-form';

export const metadata = {
  title: 'New agent — Colina Admin',
};

export default function NewAgentPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <AgentForm mode="create" />
      </Container>
    </main>
  );
}
