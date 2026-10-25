'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { saveSiteSettings } from '@/lib/actions/settings';
import { siteSettingsMessages } from '@/lib/actions/validation-messages';
import {
  siteSettingsInputSchema,
  type SiteSettingsFormInput,
  type SiteSettingsInput,
} from '@/lib/schemas';
import { normalizeWhatsappNumber } from '@/lib/whatsapp';

type SettingsFormProps = {
  defaultValues: {
    contactPhone: string;
    contactEmail: string;
    factoryAddressEn: string;
    factoryAddressAr: string;
    workingHoursEn: string;
    workingHoursAr: string;
    mapsUrl: string;
    whatsappNumber: string;
    whatsappMessageEn: string;
    whatsappMessageAr: string;
  };
};

export function SettingsForm({ defaultValues }: SettingsFormProps) {
  const t = useTranslations('Settings');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () => siteSettingsInputSchema(siteSettingsMessages(t)),
    [t]
  );

  const {
    register,
    control,
    handleSubmit,
    getValues,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<SiteSettingsFormInput, unknown, SiteSettingsInput>({
    resolver: zodResolver(schema),
    defaultValues,
  });

  // The preview is the normalized link the public site will actually open.
  // It is derived from the same helper the schema uses, so what an admin sees
  // here and what is saved cannot disagree.
  const numberValue = useWatch({ control, name: 'whatsappNumber' });
  const normalized = normalizeWhatsappNumber(numberValue ?? '');
  const preview =
    normalized.ok && normalized.value
      ? `https://wa.me/${normalized.value}`
      : null;

  async function onSubmit() {
    setFormError(null);
    // Send the RAW field values, not the resolver's output: the action's
    // schema expects the strings the admin typed and re-runs every transform
    // itself, so the client-side check is never the only validation.
    const result = await saveSiteSettings(getValues());
    if (result.ok) {
      router.push('/settings?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof SiteSettingsFormInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'unauthorized'
        ? common('errors.sessionExpired')
        : result.error === 'forbidden'
          ? common('errors.forbidden')
          : common('errors.saveFailed')
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-6 grid gap-6 pb-24 text-start"
    >
      <Card title={t('contact.title')}>
        <div className="mt-5 grid gap-5">
          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              id="settings-contact-phone"
              label={t('contact.phone')}
              error={errors.contactPhone?.message}
            >
              <input
                id="settings-contact-phone"
                type="tel"
                dir="ltr"
                inputMode="tel"
                autoComplete="off"
                placeholder={t('contact.phonePlaceholder')}
                className={inputClasses}
                {...register('contactPhone')}
              />
              <p className="mt-1 text-sm text-stone-500">
                {t('contact.phoneHint')}
              </p>
            </Field>

            <Field
              id="settings-contact-email"
              label={t('contact.email')}
              error={errors.contactEmail?.message}
            >
              <input
                id="settings-contact-email"
                type="email"
                dir="ltr"
                inputMode="email"
                autoComplete="off"
                placeholder={t('contact.emailPlaceholder')}
                className={inputClasses}
                {...register('contactEmail')}
              />
            </Field>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              id="settings-factory-address-en"
              label={t('contact.addressEn')}
              error={errors.factoryAddressEn?.message}
            >
              <textarea
                id="settings-factory-address-en"
                rows={3}
                maxLength={300}
                dir="ltr"
                className={`${inputClasses} min-h-24 resize-y`}
                {...register('factoryAddressEn')}
              />
            </Field>
            <Field
              id="settings-factory-address-ar"
              label={t('contact.addressAr')}
              error={errors.factoryAddressAr?.message}
            >
              <textarea
                id="settings-factory-address-ar"
                rows={3}
                maxLength={300}
                dir="rtl"
                className={`${inputClasses} min-h-24 resize-y`}
                {...register('factoryAddressAr')}
              />
            </Field>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              id="settings-factory-hours-en"
              label={t('contact.hoursEn')}
              error={errors.workingHoursEn?.message}
            >
              <input
                id="settings-factory-hours-en"
                type="text"
                maxLength={200}
                dir="ltr"
                autoComplete="off"
                placeholder={t('contact.hoursPlaceholderEn')}
                className={inputClasses}
                {...register('workingHoursEn')}
              />
            </Field>
            <Field
              id="settings-factory-hours-ar"
              label={t('contact.hoursAr')}
              error={errors.workingHoursAr?.message}
            >
              <input
                id="settings-factory-hours-ar"
                type="text"
                maxLength={200}
                dir="rtl"
                autoComplete="off"
                placeholder={t('contact.hoursPlaceholderAr')}
                className={inputClasses}
                {...register('workingHoursAr')}
              />
            </Field>
          </div>

          <Field
            id="settings-factory-maps-url"
            label={t('contact.mapsUrl')}
            error={errors.mapsUrl?.message}
          >
            <input
              id="settings-factory-maps-url"
              type="url"
              maxLength={500}
              dir="ltr"
              autoComplete="off"
              className={inputClasses}
              {...register('mapsUrl')}
            />
            <p className="mt-1 text-sm text-stone-500">
              {t('contact.mapsUrlHint')}
            </p>
          </Field>
        </div>
      </Card>

      <Card title={t('whatsapp.title')}>
        <div className="mt-5 grid gap-5">
          <Field
            id="settings-whatsapp-number"
            label={t('whatsapp.number')}
            error={errors.whatsappNumber?.message}
          >
            <input
              id="settings-whatsapp-number"
              type="tel"
              dir="ltr"
              inputMode="tel"
              autoComplete="off"
              placeholder={t('whatsapp.numberPlaceholder')}
              className={inputClasses}
              {...register('whatsappNumber')}
            />
            <p className="mt-1 text-sm text-stone-500">
              {t('whatsapp.numberHint')}
            </p>
            {preview ? (
              <p className="mt-2 text-sm text-stone-500">
                {t('whatsapp.previewLabel')}{' '}
                <a
                  dir="ltr"
                  href={preview}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="whatsapp-preview"
                  className="font-medium text-brand-700 underline underline-offset-4 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  {preview}
                </a>
              </p>
            ) : null}
          </Field>

          <div className="grid gap-5 lg:grid-cols-2">
            <Field
              id="settings-whatsapp-message-en"
              label={t('whatsapp.messageEn')}
              error={errors.whatsappMessageEn?.message}
            >
              <textarea
                id="settings-whatsapp-message-en"
                rows={4}
                maxLength={300}
                dir="ltr"
                className={`${inputClasses} min-h-28 resize-y`}
                {...register('whatsappMessageEn')}
              />
            </Field>
            <Field
              id="settings-whatsapp-message-ar"
              label={t('whatsapp.messageAr')}
              error={errors.whatsappMessageAr?.message}
            >
              <textarea
                id="settings-whatsapp-message-ar"
                rows={4}
                maxLength={300}
                dir="rtl"
                className={`${inputClasses} min-h-28 resize-y`}
                {...register('whatsappMessageAr')}
              />
            </Field>
          </div>
          <p className="text-sm text-stone-500">{t('whatsapp.messageHint')}</p>
        </div>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {formError}
        </p>
      ) : null}
      <FormActions
        submitLabel={t('form.submit')}
        isSubmitting={isSubmitting}
        cancelHref="/"
      />
    </form>
  );
}
