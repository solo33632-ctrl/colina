'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { createService, updateService } from '@/lib/actions/services';
import { serviceMessages } from '@/lib/actions/validation-messages';
import { serviceInputSchema, type ServiceInput } from '@/lib/schemas';

type ServiceFormProps = {
  mode: 'create' | 'edit';
  serviceId?: string;
  defaultValues?: ServiceInput;
};

export function ServiceForm({
  mode,
  serviceId,
  defaultValues,
}: ServiceFormProps) {
  const t = useTranslations('Services');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Same message namespace the Server Action validates against.
  const schema = useMemo(() => serviceInputSchema(serviceMessages(t)), [t]);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<ServiceInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      slug: '',
      titleAr: '',
      titleEn: '',
      descriptionAr: '',
      descriptionEn: '',
      scopeAr: '',
      scopeEn: '',
      icon: '',
    },
  });

  async function onSubmit(values: ServiceInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createService(values)
        : await updateService(serviceId ?? '', values);
    if (result.ok) {
      router.push('/services');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof ServiceInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'slug_taken'
        ? t('slugTaken')
        : result.error === 'unauthorized'
          ? common('errors.sessionExpired')
          : 'Saving failed. Try again.'
    );
  }

  return (
    <Card
      title={mode === 'create' ? t('form.createTitle') : t('form.editTitle')}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="service-title-en"
          label={t('form.titleEn')}
          error={errors.titleEn?.message}
        >
          <input
            id="service-title-en"
            type="text"
            className={inputClasses}
            {...register('titleEn')}
          />
        </Field>
        <Field
          id="service-title-ar"
          label={t('form.titleAr')}
          error={errors.titleAr?.message}
        >
          <input
            id="service-title-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('titleAr')}
          />
        </Field>
        <Field
          id="service-slug"
          label={t('form.slug')}
          error={errors.slug?.message}
        >
          <input
            id="service-slug"
            type="text"
            autoComplete="off"
            className={inputClasses}
            {...register('slug')}
          />
        </Field>
        <Field
          id="service-desc-en"
          label={t('form.descriptionEn')}
          error={errors.descriptionEn?.message}
        >
          <textarea
            id="service-desc-en"
            rows={3}
            className={inputClasses}
            {...register('descriptionEn')}
          />
        </Field>
        <Field
          id="service-desc-ar"
          label={t('form.descriptionAr')}
          error={errors.descriptionAr?.message}
        >
          <textarea
            id="service-desc-ar"
            rows={3}
            dir="auto"
            className={inputClasses}
            {...register('descriptionAr')}
          />
        </Field>
        <Field
          id="service-scope-en"
          label={t('form.scopeEn')}
          error={errors.scopeEn?.message}
        >
          <textarea
            id="service-scope-en"
            rows={3}
            className={inputClasses}
            {...register('scopeEn')}
          />
        </Field>
        <Field
          id="service-scope-ar"
          label={t('form.scopeAr')}
          error={errors.scopeAr?.message}
        >
          <textarea
            id="service-scope-ar"
            rows={3}
            dir="auto"
            className={inputClasses}
            {...register('scopeAr')}
          />
        </Field>
        <Field
          id="service-icon"
          label={t('form.icon')}
          error={errors.icon?.message}
        >
          <input
            id="service-icon"
            type="text"
            autoComplete="off"
            placeholder={t('form.iconPlaceholder')}
            className={inputClasses}
            {...register('icon')}
          />
        </Field>
        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? t('form.submitCreate') : t('form.submitEdit')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
