import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { AgentForm } from '@/components/agent-form';
import { DeleteButton } from '@/components/delete-button';
import { deleteAgent } from '@/lib/actions/agents';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Agents', 'form.editTitle');
}

type Props = {
  params: Promise<{ id: string }>;
};

export default async function EditAgentPage({ params }: Props) {
  const { id } = await params;
  const locale = await getLocale();
  const nav = await getTranslations('Nav');
  const common = await getTranslations('Common');
  const agent = await prisma.agent.findUnique({ where: { id } });
  if (!agent) {
    notFound();
  }

  const name =
    locale === 'ar'
      ? agent.countryAr || agent.countryEn
      : agent.countryEn || agent.countryAr;

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/agents"
          sectionLabel={nav('agents')}
          current={common('editNamed', { name })}
        />
        <AgentForm
          mode="edit"
          agentId={agent.id}
          defaultValues={{
            countryAr: agent.countryAr,
            countryEn: agent.countryEn,
            cityAr: agent.cityAr ?? '',
            cityEn: agent.cityEn ?? '',
            addressAr: agent.addressAr ?? '',
            addressEn: agent.addressEn ?? '',
            phone: agent.phone ?? '',
            email: agent.email ?? '',
          }}
        />
        <DeleteButton
          itemName={
            locale === 'ar'
              ? agent.countryAr || agent.countryEn
              : agent.countryEn || agent.countryAr
          }
          redirectTo="/agents"
          onDelete={deleteAgent.bind(null, agent.id)}
        />
      </Container>
    </main>
  );
}
