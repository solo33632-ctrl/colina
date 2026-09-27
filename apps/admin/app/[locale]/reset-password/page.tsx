import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { ResetPasswordForm } from '@/components/reset-password-form';

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
  return { title: t('reset.title'), description: t('reset.description') };
}

type Props = {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({
  params,
  searchParams,
}: Props) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const t = await getTranslations('Auth');
  const session = await getAdminSession();
  if (session) {
    redirect({ href: '/', locale });
  }

  const { token } = await searchParams;

  return (
    <main>
      <Container className="max-w-md py-16">
        <Card title={t('reset.heading')}>
          <div className="mt-4">
            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <p role="alert" className="text-sm text-stone-600">
                {t('reset.invalidLink')}
              </p>
            )}
          </div>
        </Card>
      </Container>
    </main>
  );
}
