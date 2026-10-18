import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DeleteButton } from '@/components/delete-button';
import { ShowcaseForm } from '@/components/showcase-form';
import { deleteShowcase } from '@/lib/actions/showcase';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'MaintenanceShowcase', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditMaintenanceShowcasePage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const showcase = await prisma.maintenanceShowcase.findUnique({
    where: { id },
  });
  if (!showcase) {
    notFound();
  }

  const name =
    locale === 'ar'
      ? showcase.nameAr || showcase.nameEn
      : showcase.nameEn || showcase.nameAr;

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/maintenance-showcase"
          sectionLabel={nav('maintenanceShowcase')}
          current={common('editNamed', { name })}
        />
        <ShowcaseForm
          mode="edit"
          showcaseId={showcase.id}
          defaultValues={{
            nameAr: showcase.nameAr,
            nameEn: showcase.nameEn,
            descriptionAr: showcase.descriptionAr ?? '',
            descriptionEn: showcase.descriptionEn ?? '',
            beforeImageUrl: showcase.beforeImageUrl,
            afterImageUrl: showcase.afterImageUrl,
          }}
        />
        <DeleteButton
          itemName={
            locale === 'ar'
              ? showcase.nameAr || showcase.nameEn
              : showcase.nameEn || showcase.nameAr
          }
          redirectTo="/maintenance-showcase"
          onDelete={deleteShowcase.bind(null, showcase.id)}
        />
      </Container>
    </main>
  );
}
