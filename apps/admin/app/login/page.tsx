import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { Card, Container } from '@colina/ui';
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

export default async function LoginPage() {
  const session = await getAdminSession();
  if (session) {
    redirect('/');
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
            <a
              href="/forgot-password"
              className="font-medium text-brand-700 hover:text-brand-800"
            >
              Reset it
            </a>
          </p>
        </Card>
      </Container>
    </main>
  );
}
