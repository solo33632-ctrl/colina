import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container } from '@colina/ui';
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

export default async function ForgotPasswordPage() {
  const session = await getAdminSession();
  if (session) {
    redirect('/');
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
