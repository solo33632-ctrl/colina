import { prisma } from '@colina/db';
import { Button, Card, Container } from '@colina/ui';

export default async function AdminHomePage() {
  const [categoryCount, machineCount] = await Promise.all([
    prisma.machineCategory.count(),
    prisma.machine.count(),
  ]);

  return (
    <main>
      <Container className="py-16">
        <Card
          title="Colina Admin"
          description="Manage site content. More sections arrive in Phase 11."
        >
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
          </ul>
        </Card>
      </Container>
    </main>
  );
}
