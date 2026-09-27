import type { Metadata } from 'next';
import { Container } from '@colina/ui';
import { CategoryForm } from '@/components/category-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Categories', 'form.createTitle');
}

export default function NewCategoryPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <CategoryForm mode="create" />
      </Container>
    </main>
  );
}
