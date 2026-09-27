import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { AgentForm } from '@/components/agent-form';
import { DeleteButton } from '@/components/delete-button';
import { deleteAgent } from '@/lib/actions/agents';

export const metadata = {
  title: 'Edit agent — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditAgentPage({ params }: Props) {
  const { id } = await params;
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <AgentForm
          mode="edit"
          agentId={agent.id}
          defaultValues={{
            countryAr: agent.countryAr,
            countryEn: agent.countryEn,
            cityAr: agent.cityAr ?? '',
            cityEn: agent.cityEn ?? '',
            addressAr: agent.addressAr ?? '',
            addressEn: agent.addressEn ?? '',
            phone: agent.phone ?? '',
            email: agent.email ?? '',
          }}
        />
        <DeleteButton
          label="Delete agent"
          confirmMessage="Delete this agent? This cannot be undone."
          redirectTo="/agents"
          onDelete={() => deleteAgent(agent.id)}
        />
      </Container>
    </main>
  );
}
