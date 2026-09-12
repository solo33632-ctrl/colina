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
      <Field
        id="contact-name"
        label={t('nameLabel')}
        error={errors.name?.message}
      >
        <input
          id="contact-name"
          type="text"
          autoComplete="name"
          className={inputClasses}
          {...register('name')}
        />
      </Field>
      <Field
        id="contact-email"
        label={t('emailLabel')}
        error={errors.email?.message}
      >
        <input
          id="contact-email"
          type="email"
          autoComplete="email"
          className={inputClasses}
          {...register('email')}
        />
      </Field>
      <Field
        id="contact-phone"
        label={t('phoneLabel')}
        error={errors.phone?.message}
      >
        <input
          id="contact-phone"
          type="tel"
          autoComplete="tel"
          className={inputClasses}
          {...register('phone')}
        />
      </Field>
      <Field
        id="contact-message"
        label={t('messageLabel')}
        error={errors.message?.message}
      >
        <textarea
          id="contact-message"
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
