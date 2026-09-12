'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@colina/ui';
import { Field, inputClasses } from './form-fields';

// Client-side validation only. Server-side validation, rate limiting,
// Prisma writes and email notifications arrive in Phase 8.
export function MaintenanceRequestForm() {
  const t = useTranslations('MaintenanceForm');

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, { error: t('nameError') }),
        company: z.string().optional(),
        phone: z.string().min(6, { error: t('phoneError') }),
        // Optional email: empty (or absent) passes, anything else must be
        // a valid address. The message lives on the inner email schema
        // because a failed union surfaces the branch issue, not the
        // union-level error.
        email: z
          .union([z.literal(''), z.email({ error: t('emailError') })], {
            error: t('emailError'),
          })
          .optional(),
        machineModel: z.string().optional(),
        message: z.string().min(10, { error: t('messageError') }),
      }),
    [t]
  );

  type FormValues = z.infer<typeof schema>;

  const {
    register,
    handleSubmit,
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
    },
  });

  async function onSubmit() {
    // TODO(Phase 8): POST to the maintenance-request API route instead of
    // this stub.
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
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {t('submitLabel')}
        </Button>
      </div>
    </form>
  );
}
