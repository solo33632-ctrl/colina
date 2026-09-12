import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export default async function AdminHomePage() {
  const [
    categoryCount,
    machineCount,
    partnerCount,
    serviceCount,
    newsCount,
    agentCount,
  ] = await Promise.all([
    prisma.machineCategory.count(),
    prisma.machine.count(),
    prisma.partner.count(),
    prisma.maintenanceService.count(),
    prisma.newsPost.count(),
    prisma.agent.count(),
  ]);

  return (
    <main>
      <Container className="py-16">
        <Card title="Colina Admin" description="Manage site content.">
          <ul className="mt-6 grid gap-4 sm:grid-cols-2">
            <li>
              <Button href="/categories" variant="secondary" className="w-full">
                Categories ({categoryCount})
              </Button>
            </li>
            <li>
              <Button href="/machines" variant="secondary" className="w-full">
                Machines ({machineCount})
              </Button>
            </li>
            <li>
              <Button href="/partners" variant="secondary" className="w-full">
                Partners ({partnerCount})
              </Button>
            </li>
            <li>
              <Button href="/services" variant="secondary" className="w-full">
                Services ({serviceCount})
              </Button>
            </li>
            <li>
              <Button href="/news" variant="secondary" className="w-full">
                News ({newsCount})
              </Button>
            </li>
            <li>
              <Button href="/agents" variant="secondary" className="w-full">
                Agents ({agentCount})
              </Button>
            </li>
          </ul>
        </Card>
      </Container>
    </main>
  );
}
