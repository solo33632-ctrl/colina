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

  // This is the CARD, not the section. The page owns the `<section id="quote">`
  // and its visible heading, so the card carries no heading of its own — two
  // elements with `id="quote-heading"` is invalid HTML, and it made the
  // `#quote-heading` hook ambiguous for the page, the tests and assistive tech.
  // The reassurance line stays here, directly above the fields it introduces.
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm">
      <p className="text-sm text-stone-600">{t('subheading')}</p>

      {/* Which machine this quote is about, stated rather than asked: the
          visitor should never have to type a model name to ask about one. */}
      <p className="mt-4 rounded-lg bg-brand-50 px-3 py-2 text-sm">
        <span className="block text-xs font-medium text-brand-800">
          {t('machineLabel')}
        </span>
        <span className="text-stone-700">{machineRef}</span>
      </p>

      {/* Two columns from `md` up: name beside phone, email beside company, and
          the message — the one field that wants a full line — across the whole
          width. One column on a phone.

          `md:col-start-2` is what pairs each field with its partner: with an
          auto-flowed grid the second column would fill row-major and put email
          under NAME rather than under COMPANY, so each even-numbered field
          states the column it starts in. The message simply spans both.

          Every id, name attribute, validation rule and the honeypot below are
          unchanged; only the placement is new. */}
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-5 grid gap-4 text-start md:grid-cols-2"
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
          id="quote-phone"
          label={t('phoneLabel')}
          error={errors.phone?.message}
          className="md:col-start-2"
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
          id="quote-company"
          label={t('companyLabel')}
          error={errors.company?.message}
          className="md:col-start-2"
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
          id="quote-message"
          label={t('messageLabel')}
          error={errors.message?.message}
          className="md:col-span-2"
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

        <div className="md:col-span-2">
          <Button type="submit" disabled={isSubmitting} className="w-full">
            {t('submitLabel')}
          </Button>
        </div>
      </form>
    </div>
  );
}
