'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  resetPasswordInputSchema,
} from '@/lib/schemas';

type ResetPasswordFormProps = {
  token: string;
};

export function ResetPasswordForm({ token }: ResetPasswordFormProps) {
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const schema = useMemo(
    () =>
      resetPasswordInputSchema({
        token: 'This reset link is invalid or expired.',
        password: `Password must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters.`,
      })
        .extend({ confirmPassword: z.string() })
        .refine((values) => values.password === values.confirmPassword, {
          error: 'Passwords do not match.',
          path: ['confirmPassword'],
        }),
    []
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { token, password: '', confirmPassword: '' },
  });

  async function onSubmit(values: FormValues) {
    setStatus('idle');
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: values.token,
          password: values.password,
        }),
      });
      setStatus(res.ok ? 'success' : 'error');
    } catch {
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <p role="status" className="text-sm text-stone-600">
        Your password was updated.{' '}
        <a
          href="/login"
          className="font-medium text-brand-700 hover:text-brand-800"
        >
          Log in
        </a>
      </p>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="grid gap-5 text-start"
    >
      <input type="hidden" {...register('token')} />
      <Field
        id="reset-password"
        label="New password"
        error={errors.password?.message}
      >
        <input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          className={inputClasses}
          {...register('password')}
        />
      </Field>
      <Field
        id="reset-confirm-password"
        label="Confirm new password"
        error={errors.confirmPassword?.message}
      >
        <input
          id="reset-confirm-password"
          type="password"
          autoComplete="new-password"
          className={inputClasses}
          {...register('confirmPassword')}
        />
      </Field>
      {status === 'error' ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          This reset link is invalid or expired. Request a new one.
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          Set new password
        </Button>
      </div>
    </form>
  );
}
