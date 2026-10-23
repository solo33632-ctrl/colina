import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { DeleteMaintenanceCategoryButton } from '@/components/delete-maintenance-category-button';
import { MaintenanceCategoryForm } from '@/components/maintenance-category-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'MaintenanceCategories', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditMaintenanceCategoryPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const category = await prisma.maintenanceCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!category) {
    notFound();
  }

  const name =
    locale === 'ar'
      ? category.nameAr || category.nameEn
      : category.nameEn || category.nameAr;

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/maintenance-categories"
          sectionLabel={nav('maintenanceCategories')}
          current={common('editNamed', { name })}
        />
        <MaintenanceCategoryForm
          mode="edit"
          categoryId={category.id}
          defaultValues={{
            nameAr: category.nameAr,
            nameEn: category.nameEn,
            slug: category.slug,
            descriptionAr: category.descriptionAr ?? '',
            descriptionEn: category.descriptionEn ?? '',
            imageUrl: category.imageUrl ?? '',
            sortOrder: category.sortOrder,
          }}
        />
        <DeleteMaintenanceCategoryButton
          categoryId={category.id}
          itemCount={category._count.items}
          itemName={name}
        />
      </Container>
    </main>
  );
}
