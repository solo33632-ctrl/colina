import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { Card, Container } from '@colina/ui';
import { redirect } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getAdminSession } from '@/lib/auth';
import { ForgotPasswordForm } from '@/components/forgot-password-form';

export const metadata: Metadata = {
  title: 'Forgot password — Colina Admin',
  description: 'Request a Colina admin password reset link.',
  robots: {
    index: false,
    follow: false,
  },
};

export default async function ForgotPasswordPage({
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
        <Card
          title="Forgot password"
          description="Enter your admin email and we'll send a reset link."
        >
          <div className="mt-4">
            <ForgotPasswordForm />
          </div>
        </Card>
      </Container>
    </main>
  );
}
