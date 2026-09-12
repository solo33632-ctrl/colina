import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { MachineForm } from '@/components/machine-form';

export const metadata = {
  title: 'New machine — Colina Admin',
};

export default async function NewMachinePage() {
  const [categories, machines] = await Promise.all([
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
    prisma.machine.findMany({ orderBy: { nameEn: 'asc' } }),
  ]);

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <MachineForm
          mode="create"
          categories={categories}
          machines={machines}
        />
      </Container>
    </main>
  );
}
