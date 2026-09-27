import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { ResetPasswordForm } from '@/components/reset-password-form';

export const metadata: Metadata = {
  title: 'Reset password — Colina Admin',
  description: 'Set a new Colina admin password.',
  robots: {
    index: false,
    follow: false,
  },
};

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

  const session = await getAdminSession();
  if (session) {
    redirect({ href: '/', locale });
  }

  const { token } = await searchParams;

  return (
    <main>
      <Container className="max-w-md py-16">
        <Card title="Reset password">
          <div className="mt-4">
            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <p role="alert" className="text-sm text-stone-600">
                This reset link is invalid or expired. Request a new one from
                the login page.
              </p>
            )}
          </div>
        </Card>
      </Container>
    </main>
  );
}
