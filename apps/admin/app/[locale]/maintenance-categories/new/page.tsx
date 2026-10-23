import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { MaintenanceCategoryForm } from '@/components/maintenance-category-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'MaintenanceCategories', 'form.createTitle');
}

export default async function NewMaintenanceCategoryPage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('MaintenanceCategories'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/maintenance-categories"
          sectionLabel={nav('maintenanceCategories')}
          current={t('form.createTitle')}
        />
        <MaintenanceCategoryForm mode="create" />
      </Container>
    </main>
  );
}
