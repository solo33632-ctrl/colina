'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@colina/ui';

const inputClasses =
  'w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600';

const errorClasses = 'mt-1 text-sm text-red-700';

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
      <div>
        <label
          htmlFor="maint-name"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('nameLabel')}
        </label>
        <input
          id="maint-name"
          type="text"
          autoComplete="name"
          className={inputClasses}
          {...register('name')}
        />
        {errors.name ? (
          <p role="alert" className={errorClasses}>
            {errors.name.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="maint-company"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('companyLabel')}
        </label>
        <input
          id="maint-company"
          type="text"
          autoComplete="organization"
          className={inputClasses}
          {...register('company')}
        />
        {errors.company ? (
          <p role="alert" className={errorClasses}>
            {errors.company.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="maint-phone"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('phoneLabel')}
        </label>
        <input
          id="maint-phone"
          type="tel"
          autoComplete="tel"
          className={inputClasses}
          {...register('phone')}
        />
        {errors.phone ? (
          <p role="alert" className={errorClasses}>
            {errors.phone.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="maint-email"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('emailLabel')}
        </label>
        <input
          id="maint-email"
          type="email"
          autoComplete="email"
          className={inputClasses}
          {...register('email')}
        />
        {errors.email ? (
          <p role="alert" className={errorClasses}>
            {errors.email.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="maint-machine-model"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('machineModelLabel')}
        </label>
        <input
          id="maint-machine-model"
          type="text"
          className={inputClasses}
          {...register('machineModel')}
        />
        {errors.machineModel ? (
          <p role="alert" className={errorClasses}>
            {errors.machineModel.message}
          </p>
        ) : null}
      </div>
      <div>
        <label
          htmlFor="maint-message"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('messageLabel')}
        </label>
        <textarea
          id="maint-message"
          rows={4}
          className={inputClasses}
          {...register('message')}
        />
        {errors.message ? (
          <p role="alert" className={errorClasses}>
            {errors.message.message}
          </p>
        ) : null}
      </div>
      <div>
        <Button type="submit" disabled={isSubmitting}>
          {t('submitLabel')}
        </Button>
      </div>
    </form>
  );
}
