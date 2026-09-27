import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteButton } from '@/components/delete-button';
import { ServiceForm } from '@/components/service-form';
import { deleteService } from '@/lib/actions/services';

export const metadata = {
  title: 'Edit service — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditServicePage({ params }: Props) {
  const { id } = await params;
  const service = await prisma.maintenanceService.findUnique({
    where: { id },
  });
  if (!service) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <ServiceForm
          mode="edit"
          serviceId={service.id}
          defaultValues={{
            slug: service.slug,
            titleAr: service.titleAr,
            titleEn: service.titleEn,
            descriptionAr: service.descriptionAr,
            descriptionEn: service.descriptionEn,
            scopeAr: service.scopeAr,
            scopeEn: service.scopeEn,
            icon: service.icon,
          }}
        />
        <DeleteButton
          label="Delete service"
          confirmMessage="Delete this service? This cannot be undone."
          redirectTo="/services"
          onDelete={() => deleteService(service.id)}
        />
      </Container>
    </main>
  );
}
