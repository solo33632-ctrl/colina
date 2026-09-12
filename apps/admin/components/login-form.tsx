'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { signIn } from 'next-auth/react';
import { useForm } from 'react-hook-form';
import { Button } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { loginInputSchema } from '@/lib/schemas';

// Admin strings are hardcoded English per the Phase 3 admin-stays-English
// decision — no message files on this app.
export function LoginForm() {
  const router = useRouter();
  const [status, setStatus] = useState<'idle' | 'error'>('idle');

  const schema = useMemo(
    () =>
      loginInputSchema({
        email: 'Enter a valid email address.',
        password: 'Enter your password.',
      }),
    []
  );

  type FormValues = { email: string; password: string };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '' },
  });

  async function onSubmit(values: FormValues) {
    setStatus('idle');
    // Generic failure either way: never reveal whether the email exists.
    const res = await signIn('credentials', {
      email: values.email,
      password: values.password,
      redirect: false,
    });
    if (!res || !res.ok) {
      setStatus('error');
      return;
    }
    router.push('/');
    router.refresh();
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-5 text-start"
    >
      <Field id="login-email" label="Email" error={errors.email?.message}>
        <input
          id="login-email"
          type="email"
          autoComplete="email"
          className={inputClasses}
          {...register('email')}
        />
      </Field>
      <Field
        id="login-password"
        label="Password"
        error={errors.password?.message}
      >
        <input
          id="login-password"
          type="password"
          autoComplete="current-password"
          className={inputClasses}
          {...register('password')}
        />
      </Field>
      {status === 'error' ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          Invalid email or password.
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          Log in
        </Button>
      </div>
    </form>
  );
}
