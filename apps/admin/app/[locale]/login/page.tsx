import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';

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
  return { title: t('login.title'), description: t('login.description') };
}

export default async function LoginPage({
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
        <Card title={t('login.heading')}>
          <div className="mt-4">
            <LoginForm />
          </div>
          <p className="mt-4 text-sm text-stone-600">
            {t('login.forgotPrompt')}{' '}
            <Link
              href="/forgot-password"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              {t('login.resetLink')}
            </Link>
          </p>
        </Card>
      </Container>
    </main>
  );
}
