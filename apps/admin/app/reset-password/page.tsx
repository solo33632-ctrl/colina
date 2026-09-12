import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container } from '@colina/ui';
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
  searchParams: Promise<{ token?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const session = await getAdminSession();
  if (session) {
    redirect('/');
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
