import type { Metadata } from 'next';
import { Container } from '@colina/ui';
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

export default function NewNewsPage() {
  return (
    <main>
      <Container className="max-w-2xl py-10">
        <AgentForm mode="create" />
      </Container>
    </main>
  );
}
