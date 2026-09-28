import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { PartnerForm } from '@/components/partner-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Partners', 'form.createTitle');
}

export default async function NewPartnerPage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Partners'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/partners"
          sectionLabel={nav('partners')}
          current={t('form.createTitle')}
        />
        <PartnerForm mode="create" />
      </Container>
    </main>
  );
}
