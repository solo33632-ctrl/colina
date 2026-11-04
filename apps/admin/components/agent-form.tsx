'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { UploadField } from './upload-field';
import { createAgent, updateAgent } from '@/lib/actions/agents';
import { agentMessages } from '@/lib/actions/validation-messages';
import {
  agentInputSchema,
  type AgentFormInput,
  type AgentInput,
} from '@/lib/schemas';

type AgentFormProps = {
  mode: 'create' | 'edit';
  agentId?: string;
  defaultValues?: AgentFormInput;
};

export function AgentForm({ mode, agentId, defaultValues }: AgentFormProps) {
  const t = useTranslations('Agents');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => agentInputSchema(agentMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    clearErrors,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<AgentFormInput, unknown, AgentInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      countryAr: '',
      countryEn: '',
      nameAr: '',
      nameEn: '',
      cityAr: '',
      cityEn: '',
      addressAr: '',
      addressEn: '',
      phone: '',
      email: '',
      websiteUrl: '',
      logoUrl: '',
      isPublished: true,
    },
  });

  const logoValue = useWatch({ control, name: 'logoUrl' });

  async function onSubmit(values: AgentInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createAgent(values)
        : await updateAgent(agentId ?? '', values);
    if (result.ok) {
      router.push('/agents?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof AgentInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'unauthorized'
        ? common('errors.sessionExpired')
        : common('errors.saveFailed')
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-6 grid gap-6 pb-24 text-start"
    >
      {/* Identity: what names the agent on the public site and in this list.
          A name is required on every save, so a legacy row without one asks
          for it the next time it is edited. */}
      <Card title={t('sections.identity')} className="lg:col-span-2">
        <div className="grid gap-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="agent-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="agent-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
            <Field
              id="agent-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="agent-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
          </div>
          {/* Reused partner logo uploader: choose a file (Cloudinary upload)
              or paste an already-hosted URL; the schema rules are shared. */}
          <Field
            id="agent-logo"
            label={t('form.logo')}
            error={errors.logoUrl?.message}
          >
            <UploadField
              id="agent-logo"
              kind="image"
              value={logoValue ?? ''}
              onUploaded={(url) => {
                setValue('logoUrl', url, {
                  shouldValidate: true,
                  shouldDirty: true,
                });
                clearErrors('logoUrl');
              }}
              onClear={() =>
                setValue('logoUrl', '', {
                  shouldValidate: true,
                  shouldDirty: true,
                })
              }
              urlInputProps={register('logoUrl')}
            />
          </Field>
        </div>
      </Card>

      {/* Location: the country pair is what the public page groups agents
          by, and the city headlines each card. The two languages mirror the
          other bilingual forms. */}
      <Card title={t('sections.location')} className="lg:col-span-2">
        <div className="grid gap-6 lg:grid-cols-2">
          <div dir="rtl" className="grid gap-5">
            <Field
              id="agent-country-ar"
              label={t('form.countryAr')}
              error={errors.countryAr?.message}
            >
              <input
                id="agent-country-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('countryAr')}
              />
            </Field>
            <Field id="agent-city-ar" label={t('form.cityAr')}>
              <input
                id="agent-city-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('cityAr')}
              />
            </Field>
            <Field id="agent-address-ar" label={t('form.addressAr')}>
              <textarea
                id="agent-address-ar"
                rows={3}
                dir="rtl"
                className={inputClasses}
                {...register('addressAr')}
              />
            </Field>
          </div>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="agent-country-en"
              label={t('form.countryEn')}
              error={errors.countryEn?.message}
            >
              <input
                id="agent-country-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('countryEn')}
              />
            </Field>
            <Field id="agent-city-en" label={t('form.cityEn')}>
              <input
                id="agent-city-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('cityEn')}
              />
            </Field>
            <Field id="agent-address-en" label={t('form.addressEn')}>
              <textarea
                id="agent-address-en"
                rows={3}
                dir="ltr"
                className={inputClasses}
                {...register('addressEn')}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Contact: language-neutral values pinned LTR, plus the website link. */}
      <Card title={t('sections.contact')} className="lg:col-span-2">
        <div className="grid gap-5 sm:grid-cols-2">
          <Field id="agent-phone" label={t('form.phone')}>
            <input
              id="agent-phone"
              type="tel"
              autoComplete="tel"
              dir="ltr"
              className={inputClasses}
              {...register('phone')}
            />
          </Field>
          <Field id="agent-email" label={t('form.email')}>
            <input
              id="agent-email"
              type="email"
              autoComplete="email"
              dir="ltr"
              className={inputClasses}
              {...register('email')}
            />
          </Field>
          <div className="sm:col-span-2">
            <Field
              id="agent-website"
              label={t('form.website')}
              error={errors.websiteUrl?.message}
            >
              <input
                id="agent-website"
                type="url"
                autoComplete="url"
                placeholder="https://"
                dir="ltr"
                className={inputClasses}
                {...register('websiteUrl')}
              />
            </Field>
          </div>
        </div>
      </Card>

      {/* Visibility: the quick switch behind the list's publish/hide action. */}
      <Card title={t('sections.visibility')} className="lg:col-span-2">
        <label
          htmlFor="agent-published"
          className="flex w-fit cursor-pointer items-center gap-3"
        >
          <div className="relative grid place-items-center">
            <input
              id="agent-published"
              type="checkbox"
              className="peer sr-only"
              {...register('isPublished')}
            />
            <span
              aria-hidden="true"
              className="pointer-events-none relative h-6 w-11 rounded-full bg-stone-300 transition-colors peer-checked:bg-brand-700 after:absolute after:top-0.5 after:start-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-5 rtl:peer-checked:after:-translate-x-5 peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand-600"
            />
          </div>
          <span className="text-sm font-medium text-stone-900">
            {t('form.publishedOn')}
          </span>
        </label>
        <p className="mt-2 text-sm text-stone-500">{t('form.publishHelp')}</p>
      </Card>

      {formError ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {formError}
        </p>
      ) : null}
      <FormActions
        submitLabel={
          mode === 'create' ? t('form.submitCreate') : t('form.submitEdit')
        }
        isSubmitting={isSubmitting}
        cancelHref="/agents"
      />
    </form>
  );
}
