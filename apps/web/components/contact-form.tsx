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
export function ContactForm() {
  const t = useTranslations('Contact');

  const schema = useMemo(
    () =>
      z.object({
        name: z.string().min(2, { error: t('nameError') }),
        email: z.email({ error: t('emailError') }),
        phone: z.string().min(6, { error: t('phoneError') }),
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
    defaultValues: { name: '', email: '', phone: '', message: '' },
  });

  async function onSubmit() {
    // TODO(Phase 8): POST to the contact API route instead of this stub.
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mx-auto mt-8 grid max-w-xl gap-5 text-start"
    >
      <div>
        <label
          htmlFor="contact-name"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('nameLabel')}
        </label>
        <input
          id="contact-name"
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
          htmlFor="contact-email"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('emailLabel')}
        </label>
        <input
          id="contact-email"
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
          htmlFor="contact-phone"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('phoneLabel')}
        </label>
        <input
          id="contact-phone"
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
          htmlFor="contact-message"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('messageLabel')}
        </label>
        <textarea
          id="contact-message"
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
