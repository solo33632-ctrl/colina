import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { MachineForm } from '@/components/machine-form';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Machines', 'form.createTitle');
}

export default async function NewMachinePage() {
  // The form needs the category to pick from and the machines a new one can be
  // related to.
  const [nav, t, categories, machines] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Machines'),
    prisma.machineCategory.findMany({ orderBy: { nameEn: 'asc' } }),
    prisma.machine.findMany({ orderBy: { nameEn: 'asc' } }),
  ]);

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <Breadcrumbs
          sectionHref="/machines"
          sectionLabel={nav('machines')}
          current={t('form.createTitle')}
        />
        <MachineForm
          mode="create"
          categories={categories}
          machines={machines}
        />
      </Container>
    </main>
  );
}
