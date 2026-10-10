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

type QuoteRequestPanelProps = {
  /**
   * What the admin will see as the "machine / model" on this lead: the
   * localized name plus the stable slug, so a lead names both the machine and
   * the exact page it came from.
   */
  machineRef: string;
};

/**
 * The per-machine quote panel.
 *
 * Submits to `/api/maintenance-request` rather than to a new endpoint: that
 * route is the only lead endpoint with a machine field (`machineModel`), and
 * it already carries the honeypot, the same-origin check, the per-IP rate
 * limit and the server-side Zod validation. Reusing it means a quote lands in
 * the admin's existing leads inbox with no admin-side change and no second set
 * of security controls to keep in step. The machine reference is submitted
 * alongside the visitor's own message rather than trusted from the URL.
 *
 * The field set and every validation rule are the shared
 * `maintenanceRequestInputSchema`, the same one the public maintenance form
 * uses, so the two cannot drift.
 */
export function QuoteRequestPanel({ machineRef }: QuoteRequestPanelProps) {
  const t = useTranslations('QuoteForm');
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
      machineModel: machineRef,
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
        body: JSON.stringify({
          ...values,
          // Sent with the submission rather than read from the URL: the
          // machine is part of the lead, and the schema still validates it.
          machineModel: machineRef,
        }),
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
    <section
      aria-labelledby="quote-heading"
      className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm"
    >
      <h2 id="quote-heading" className="text-lg font-semibold text-stone-900">
        {t('heading')}
      </h2>
      <p className="mt-1 text-sm text-stone-600">{t('subheading')}</p>

      {/* Which machine this quote is about, stated rather than asked: the
          visitor should never have to type a model name to ask about one. */}
      <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm">
        <span className="block text-xs font-medium text-brand-800">
          {t('machineLabel')}
        </span>
        <span className="text-stone-700">{machineRef}</span>
      </p>

      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-5 grid gap-4 text-start"
      >
        <Field
          id="quote-name"
          label={t('nameLabel')}
          error={errors.name?.message}
        >
          <input
            id="quote-name"
            type="text"
            autoComplete="name"
            className={inputClasses}
            {...register('name')}
          />
        </Field>
        <Field
          id="quote-company"
          label={t('companyLabel')}
          error={errors.company?.message}
        >
          <input
            id="quote-company"
            type="text"
            autoComplete="organization"
            className={inputClasses}
            {...register('company')}
          />
        </Field>
        <Field
          id="quote-phone"
          label={t('phoneLabel')}
          error={errors.phone?.message}
        >
          <input
            id="quote-phone"
            type="tel"
            autoComplete="tel"
            className={inputClasses}
            {...register('phone')}
          />
        </Field>
        <Field
          id="quote-email"
          label={t('emailLabel')}
          error={errors.email?.message}
        >
          <input
            id="quote-email"
            type="email"
            autoComplete="email"
            className={inputClasses}
            {...register('email')}
          />
        </Field>
        <Field
          id="quote-message"
          label={t('messageLabel')}
          error={errors.message?.message}
        >
          <textarea
            id="quote-message"
            rows={3}
            placeholder={t('messagePlaceholder')}
            className={inputClasses}
            {...register('message')}
          />
        </Field>

        {/* Honeypot: visually hidden (not display:none), skipped by keyboard
            and screen readers. `sr-only` rather than an off-screen offset:
            a negative physical `left` on an RTL page extends the document
            ~10000px and the whole page scrolls sideways. */}
        <div aria-hidden="true" className="sr-only">
          <input
            tabIndex={-1}
            autoComplete="off"
            {...register(HONEYPOT_FIELD)}
          />
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
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {t('submitLabel')}
          </Button>
        </div>
      </form>
    </section>
  );
}
