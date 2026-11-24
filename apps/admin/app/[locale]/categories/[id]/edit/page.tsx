import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { getLocale, getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { CategoryForm } from '@/components/category-form';
import { DeleteCategoryButton } from '@/components/delete-category-button';
import { sectionMetadata } from '@/lib/metadata';
import { canModifyEntity } from '@/lib/permissions';
import { guardPage } from '@/lib/page-guard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Categories', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCategoryPage({ params }: Props) {
  const session = await guardPage('categories:write');
  const { id } = await params;
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const category = await prisma.machineCategory.findUnique({
    where: { id },
    include: { _count: { select: { machines: true } } },
  });
  if (!category) {
    notFound();
  }
  // Another owner's category is indistinguishable from a missing row.
  if (!canModifyEntity(session, category)) {
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
          sectionHref="/categories"
          sectionLabel={nav('categories')}
          current={common('editNamed', { name })}
        />
        <CategoryForm
          mode="edit"
          categoryId={category.id}
          canPublish={session.user.role === 'SUPER_ADMIN'}
          defaultValues={{
            nameAr: category.nameAr,
            nameEn: category.nameEn,
            slug: category.slug,
            descriptionAr: category.descriptionAr,
            descriptionEn: category.descriptionEn,
            image: category.image ?? '',
            isPublished: category.isPublished,
          }}
        />
        <DeleteCategoryButton
          categoryId={category.id}
          machineCount={category._count.machines}
          itemName={
            locale === 'ar'
              ? category.nameAr || category.nameEn
              : category.nameEn || category.nameAr
          }
        />
      </Container>
    </main>
  );
}
