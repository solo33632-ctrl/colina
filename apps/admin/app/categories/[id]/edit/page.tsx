import { notFound } from 'next/navigation';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { CategoryForm } from '@/components/category-form';
import { DeleteCategoryButton } from '@/components/delete-category-button';

export const metadata = {
  title: 'Edit category — Colina Admin',
};

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditCategoryPage({ params }: Props) {
  const { id } = await params;
  const category = await prisma.machineCategory.findUnique({
    where: { id },
    include: { _count: { select: { machines: true } } },
  });
  if (!category) {
    notFound();
  }

  return (
    <main>
      <Container className="max-w-2xl py-10">
        <CategoryForm
          mode="edit"
          categoryId={category.id}
          defaultValues={{
            nameAr: category.nameAr,
            nameEn: category.nameEn,
            slug: category.slug,
            descriptionAr: category.descriptionAr,
            descriptionEn: category.descriptionEn,
            image: category.image ?? '',
          }}
        />
        <DeleteCategoryButton
          categoryId={category.id}
          machineCount={category._count.machines}
        />
      </Container>
    </main>
  );
}
