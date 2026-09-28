import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
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

export default async function NewCategoryPage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Categories'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/categories"
          sectionLabel={nav('categories')}
          current={t('form.createTitle')}
        />
        <CategoryForm mode="create" />
      </Container>
    </main>
  );
}
