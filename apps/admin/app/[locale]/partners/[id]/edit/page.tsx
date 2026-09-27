import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { DeleteButton } from '@/components/delete-button';
import { PartnerForm } from '@/components/partner-form';
import { deletePartner } from '@/lib/actions/partners';

export const metadata = {
  title: 'Edit partner — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditPartnerPage({ params }: Props) {
  const { id } = await params;
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <PartnerForm
          mode="edit"
          partnerId={partner.id}
          defaultValues={{
            nameAr: partner.nameAr,
            nameEn: partner.nameEn,
            logo: partner.logo,
          }}
        />
        <DeleteButton
          label="Delete partner"
          confirmMessage="Delete this partner? This cannot be undone."
          redirectTo="/partners"
          onDelete={() => deletePartner(partner.id)}
        />
      </Container>
    </main>
  );
}
