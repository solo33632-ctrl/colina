import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DeleteButton } from '@/components/delete-button';
import { PartnerForm } from '@/components/partner-form';
import { deletePartner } from '@/lib/actions/partners';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Partners', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditPartnerPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const partner = await prisma.partner.findUnique({ where: { id } });
  if (!partner) {
    notFound();
  }

  const name =
    locale === 'ar'
      ? partner.nameAr || partner.nameEn
      : partner.nameEn || partner.nameAr;

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/partners"
          sectionLabel={nav('partners')}
          current={common('editNamed', { name })}
        />
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
          itemName={
            locale === 'ar'
              ? partner.nameAr || partner.nameEn
              : partner.nameEn || partner.nameAr
          }
          redirectTo="/partners"
          onDelete={deletePartner.bind(null, partner.id)}
        />
      </Container>
    </main>
  );
}
