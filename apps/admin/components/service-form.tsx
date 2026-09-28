'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { useAutoSlug } from './use-auto-slug';
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

  const schema = useMemo(() => serviceInputSchema(serviceMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
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

  const titleEnValue = useWatch({ control, name: 'titleEn' });
  const { markSlugTouched } = useAutoSlug<ServiceInput>({
    enabled: mode === 'create',
    source: titleEnValue ?? '',
    slug: 'slug',
    setValue,
  });
  const slugField = register('slug');

  async function onSubmit(values: ServiceInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createService(values)
        : await updateService(serviceId ?? '', values);
    if (result.ok) {
      router.push('/services?saved=1');
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
        {/* No files on a service, and only two language-neutral fields, so the
            basic section spans the row and the language sections sit below. */}
        <Card title={common('sectionBasic')} className="lg:col-span-2">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field
              id="service-slug"
              label={t('form.slug')}
              error={errors.slug?.message}
            >
              <input
                id="service-slug"
                type="text"
                autoComplete="off"
                dir="ltr"
                className={inputClasses}
                {...slugField}
                onChange={(event) => {
                  markSlugTouched();
                  slugField.onChange(event);
                }}
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
                dir="ltr"
                placeholder={t('form.iconPlaceholder')}
                className={inputClasses}
                {...register('icon')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="service-title-ar"
              label={t('form.titleAr')}
              error={errors.titleAr?.message}
            >
              <input
                id="service-title-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('titleAr')}
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
                dir="rtl"
                className={inputClasses}
                {...register('descriptionAr')}
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
                dir="rtl"
                className={inputClasses}
                {...register('scopeAr')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionEnglish')}>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="service-title-en"
              label={t('form.titleEn')}
              error={errors.titleEn?.message}
            >
              <input
                id="service-title-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('titleEn')}
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
                dir="ltr"
                className={inputClasses}
                {...register('descriptionEn')}
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
                dir="ltr"
                className={inputClasses}
                {...register('scopeEn')}
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
        cancelHref="/services"
      />
    </form>
  );
}
