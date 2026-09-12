'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import {
  HONEYPOT_FIELD,
  maintenanceRequestInputSchema,
  type MaintenanceRequestInput,
} from '@/lib/schemas';

// Client-side validation mirrors the server (same rules via the shared
// factory). Submission itself is handled by `/api/maintenance-request`.
export function MaintenanceRequestForm() {
  const t = useTranslations('MaintenanceForm');
  const [status, setStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const schema = useMemo(
    () =>
      maintenanceRequestInputSchema({
        name: t('nameError'),
        email: t('emailError'),
        phone: t('phoneError'),
        message: t('messageError'),
      }),
    [t]
  );

  type FormValues = MaintenanceRequestInput;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: '',
      company: '',
      phone: '',
      email: '',
      machineModel: '',
      message: '',
      [HONEYPOT_FIELD]: '',
    },
  });

  async function onSubmit(values: FormValues) {
    setStatus('idle');
    try {
      const res = await fetch('/api/maintenance-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(values),
      });
      if (!res.ok) {
        setStatus('error');
        return;
      }
      reset();
      setStatus('success');
    } catch {
      setStatus('error');
    }
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mx-auto mt-8 grid max-w-xl gap-5 text-start"
    >
      <Field
        id="maint-name"
        label={t('nameLabel')}
        error={errors.name?.message}
      >
        <input
          id="maint-name"
          type="text"
          autoComplete="name"
          className={inputClasses}
          {...register('name')}
        />
      </Field>
      <Field
        id="maint-company"
        label={t('companyLabel')}
        error={errors.company?.message}
      >
        <input
          id="maint-company"
          type="text"
          autoComplete="organization"
          className={inputClasses}
          {...register('company')}
        />
      </Field>
      <Field
        id="maint-phone"
        label={t('phoneLabel')}
        error={errors.phone?.message}
      >
        <input
          id="maint-phone"
          type="tel"
          autoComplete="tel"
          className={inputClasses}
          {...register('phone')}
        />
      </Field>
      <Field
        id="maint-email"
        label={t('emailLabel')}
        error={errors.email?.message}
      >
        <input
          id="maint-email"
          type="email"
          autoComplete="email"
          className={inputClasses}
          {...register('email')}
        />
      </Field>
      <Field
        id="maint-machine-model"
        label={t('machineModelLabel')}
        error={errors.machineModel?.message}
      >
        <input
          id="maint-machine-model"
          type="text"
          className={inputClasses}
          {...register('machineModel')}
        />
      </Field>
      <Field
        id="maint-message"
        label={t('messageLabel')}
        error={errors.message?.message}
      >
        <textarea
          id="maint-message"
          rows={4}
          className={inputClasses}
          {...register('message')}
        />
      </Field>
      {/* Honeypot: off-screen (not display:none), skipped by keyboard and
          screen readers. Bots that fill it get a fake success server-side. */}
      <div
        aria-hidden="true"
        className="absolute -left-[9999px] h-px w-px overflow-hidden opacity-0"
      >
        <input tabIndex={-1} autoComplete="off" {...register(HONEYPOT_FIELD)} />
      </div>
      {status === 'success' ? (
        <p role="status" className="text-sm font-medium text-brand-800">
          {t('submitSuccess')}
        </p>
      ) : null}
      {status === 'error' ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {t('submitError')}
        </p>
      ) : null}
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {t('submitLabel')}
        </Button>
      </div>
    </form>
  );
}
