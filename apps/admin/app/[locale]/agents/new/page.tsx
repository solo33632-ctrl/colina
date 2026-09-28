import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { AgentForm } from '@/components/agent-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Agents', 'form.createTitle');
}

export default async function NewAgentPage() {
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Agents'),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/agents"
          sectionLabel={nav('agents')}
          current={t('form.createTitle')}
        />
        <AgentForm mode="create" />
      </Container>
    </main>
  );
}
