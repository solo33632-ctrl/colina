import type { Metadata } from 'next';
import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { Card, Container } from '@colina/ui';
import { SaveBanner } from '@/components/save-banner';
import { SettingsForm } from '@/components/settings-form';
import { requireSuperAdmin } from '@/lib/admin-action';
import { sectionMetadata } from '@/lib/metadata';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  return sectionMetadata(locale, 'Settings', 'heading');
}

type Props = {
  searchParams: Promise<{ saved?: string }>;
};

export default async function SettingsPage({ searchParams }: Props) {
  const t = await getTranslations('Settings');
  const common = await getTranslations('Common');

  // Same gate as the insights dashboard and the audit log: site-wide settings
  // are a super-admin screen. An editor gets the explanatory card and none of
  // the query below runs.
  const session = await requireSuperAdmin();
  if (!session) {
    return (
      <main>
        <Container className="max-w-2xl py-16">
          <Card
            title={t('notAuthorizedTitle')}
            description={t('notAuthorizedDescription')}
          />
        </Container>
      </main>
    );
  }

  const { saved } = await searchParams;
  // A missing row is the normal first-visit state: the form opens with empty
  // defaults and nothing is written until the first save.
  const settings = await prisma.siteSettings.findUnique({
    where: { id: 'main' },
  });

  return (
    <main>
      <Container className="max-w-5xl py-10">
        <h1 className="text-2xl font-bold text-stone-900">{t('heading')}</h1>
        {saved ? <SaveBanner message={common('saved')} /> : null}
        <SettingsForm
          defaultValues={{
            whatsappNumber: settings?.whatsappNumber ?? '',
            whatsappMessageEn: settings?.whatsappMessageEn ?? '',
            whatsappMessageAr: settings?.whatsappMessageAr ?? '',
          }}
        />
      </Container>
    </main>
  );
}
