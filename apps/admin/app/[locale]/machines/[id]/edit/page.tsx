import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteMachineButton } from '@/components/delete-machine-button';
import { MachineForm } from '@/components/machine-form';

export const metadata = {
  title: 'Edit machine — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditMachinePage({ params }: Props) {
  const { id } = await params;
  const [machine, categories, machines] = await Promise.all([
    prisma.machine.findUnique({
      where: { id },
      include: {
        images: { orderBy: { position: 'asc' } },
        relatedMachines: { select: { id: true } },
      },
    }),
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
    prisma.machine.findMany({ orderBy: { nameEn: 'asc' } }),
  ]);
  if (!machine) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <MachineForm
          mode="edit"
          machineId={machine.id}
          categories={categories}
          machines={machines}
          defaultValues={{
            nameAr: machine.nameAr,
            nameEn: machine.nameEn,
            slug: machine.slug,
            categoryId: machine.categoryId,
            shortDescriptionAr: machine.shortDescriptionAr,
            shortDescriptionEn: machine.shortDescriptionEn,
            descriptionAr: machine.descriptionAr,
            descriptionEn: machine.descriptionEn,
            specsAr: machine.specsAr,
            specsEn: machine.specsEn,
            datasheetUrl: machine.datasheetUrl ?? '',
            images: machine.images.map((image) => ({
              url: image.url,
              position: image.position,
            })),
            relatedIds: machine.relatedMachines.map((related) => related.id),
          }}
        />
        <DeleteMachineButton machineId={machine.id} />
      </Container>
    </main>
  );
}
