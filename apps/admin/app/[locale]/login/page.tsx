import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { Link, redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { LoginForm } from '@/components/login-form';

export const metadata: Metadata = {
  title: 'Log in — Colina Admin',
  description: 'Colina internal admin login.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function LoginPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  const session = await getAdminSession();
  if (session) {
    redirect({ href: '/', locale });
  }

  return (
    <main>
      <Container className="max-w-md py-16">
        <Card title="Admin login">
          <div className="mt-4">
            <LoginForm />
          </div>
          <p className="mt-4 text-sm text-stone-600">
            Forgot your password?{' '}
            <Link
              href="/forgot-password"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              Reset it
            </Link>
          </p>
        </Card>
      </Container>
    </main>
  );
}
