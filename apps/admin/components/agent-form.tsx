'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { createAgent, updateAgent } from '@/lib/actions/agents';
import { agentMessages } from '@/lib/actions/validation-messages';
import { agentInputSchema, type AgentInput } from '@/lib/schemas';

type AgentFormProps = {
  mode: 'create' | 'edit';
  agentId?: string;
  defaultValues?: AgentInput;
};

export function AgentForm({ mode, agentId, defaultValues }: AgentFormProps) {
  const t = useTranslations('Agents');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => agentInputSchema(agentMessages(t)), [t]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AgentInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      countryAr: '',
      countryEn: '',
      cityAr: '',
      cityEn: '',
      addressAr: '',
      addressEn: '',
      phone: '',
      email: '',
    },
  });

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
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Contact details are the same in both languages, so they get their
            own full-width section above the two language columns. */}
        <Card title={common('sectionBasic')} className="lg:col-span-2">
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
          </div>
        </Card>
        <Card title={common('sectionArabic')}>
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
        </Card>
        <Card title={common('sectionEnglish')}>
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
        </Card>
      </div>
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
