import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ShowcaseForm } from '@/components/showcase-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'MaintenanceShowcase', 'form.createTitle');
}

export default async function NewMaintenanceShowcasePage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('MaintenanceShowcase'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/maintenance-showcase"
          sectionLabel={nav('maintenanceShowcase')}
          current={t('form.createTitle')}
        />
        <ShowcaseForm mode="create" />
      </Container>
    </main>
  );
}
