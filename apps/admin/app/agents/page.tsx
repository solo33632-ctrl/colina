import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export const metadata = {
  title: 'Agents — Colina Admin',
};

export default async function AgentsPage() {
  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: 'asc' },
  });

  return (
    <main>
      <Container className="py-10">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-bold text-stone-900">Agents</h1>
          <Button href="/agents/new" size="sm">
            New agent
          </Button>
        </div>
        {agents.length === 0 ? (
          <Card className="mt-6" description="No agents yet." />
        ) : (
          <ul className="mt-6 grid gap-4">
            {agents.map((agent) => (
              <li key={agent.id}>
                <Card>
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-semibold text-stone-900">
                        {agent.countryEn}
                      </p>
                      <p className="text-sm text-stone-500">
                        {[agent.cityEn, agent.phone]
                          .filter(Boolean)
                          .join(' · ') || agent.countryAr}
                      </p>
                    </div>
                    <a
                      href={`/agents/${agent.id}/edit`}
                      className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                    >
                      Edit
                    </a>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </Container>
    </main>
  );
}
