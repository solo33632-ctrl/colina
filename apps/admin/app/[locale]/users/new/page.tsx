import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Container } from '@colina/ui';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { EditorForm } from '@/components/editor-form';
import { sectionMetadata } from '@/lib/metadata';
import { guardPage } from '@/lib/page-guard';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Users', 'createTitle');
}

export default async function NewUserPage() {
  await guardPage('users:manage');
  const [nav, t] = await Promise.all([
    getTranslations('Nav'),
    getTranslations('Users'),
  ]);

  return (
    <main>
      <Container className="max-w-3xl py-10">
        <Breadcrumbs
          sectionHref="/users"
          sectionLabel={nav('users')}
          current={t('createTitle')}
        />
        <EditorForm />
      </Container>
    </main>
  );
}
