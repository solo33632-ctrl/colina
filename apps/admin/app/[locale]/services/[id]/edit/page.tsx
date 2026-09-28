import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteButton } from '@/components/delete-button';
import { ServiceForm } from '@/components/service-form';
import { deleteService } from '@/lib/actions/services';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Services', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditServicePage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
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
          itemName={
            locale === 'ar'
              ? service.titleAr || service.titleEn
              : service.titleEn || service.titleAr
          }
          redirectTo="/services"
          onDelete={deleteService.bind(null, service.id)}
        />
      </Container>
    </main>
  );
}
