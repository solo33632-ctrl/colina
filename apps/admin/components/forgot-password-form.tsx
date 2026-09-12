'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { forgotPasswordInputSchema } from '@/lib/schemas';

export function ForgotPasswordForm() {
  // Always the same message, found or not: the response must never leak
  // whether the email belongs to an admin account.
  const [sent, setSent] = useState(false);

  const schema = useMemo(
    () =>
      forgotPasswordInputSchema({
        email: 'Enter a valid email address.',
      }),
    []
  );

  type FormValues = { email: string };

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  async function onSubmit(values: FormValues) {
    try {
      await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
    } catch {
      // Network failure is indistinguishable by design — same message.
    }
    setSent(true);
  }

  if (sent) {
    return (
      <p role="status" className="text-sm text-stone-600">
        If that email belongs to an admin account, a reset link is on its way.
        It expires in one hour.
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-5 text-start"
    >
      <Field id="forgot-email" label="Email" error={errors.email?.message}>
        <input
          id="forgot-email"
          type="email"
          autoComplete="email"
          className={inputClasses}
          {...register('email')}
        />
      </Field>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          Send reset link
        </Button>
      </div>
    </form>
  );
}
