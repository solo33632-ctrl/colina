import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { ServiceForm } from '@/components/service-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Services', 'form.createTitle');
}

export default async function NewServicePage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Services'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/services"
          sectionLabel={nav('services')}
          current={t('form.createTitle')}
        />
        <ServiceForm mode="create" />
      </Container>
    </main>
  );
}
