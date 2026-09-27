import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const t = await getTranslations({ locale, namespace: 'Auth' });
  return { title: t('forgot.title'), description: t('forgot.description') };
}

export default async function ForgotPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations('Auth');
  const session = await getAdminSession();
  if (session) {
    redirect({ href: '/', locale });
  }

  return (
    <main>
      <Container className="max-w-md py-16">
        <Card title={t('forgot.heading')} description={t('forgot.subheading')}>
          <div className="mt-4">
            <ForgotPasswordForm />
          </div>
        </Card>
      </Container>
    </main>
  );
}
