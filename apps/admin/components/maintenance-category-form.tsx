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
import { useAutoSlug } from './use-auto-slug';
import {
  createMaintenanceCategory,
  updateMaintenanceCategory,
} from '@/lib/actions/maintenance-categories';
import { maintenanceCategoryMessages } from '@/lib/actions/validation-messages';
import {
  maintenanceCategoryInputSchema,
  type MaintenanceCategoryFormInput,
  type MaintenanceCategoryInput,
} from '@/lib/schemas';

type MaintenanceCategoryFormProps = {
  mode: 'create' | 'edit';
  categoryId?: string;
  defaultValues?: MaintenanceCategoryInput;
};

export function MaintenanceCategoryForm({
  mode,
  categoryId,
  defaultValues,
}: MaintenanceCategoryFormProps) {
  const t = useTranslations('MaintenanceCategories');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Same message namespace the Server Action validates against.
  const schema = useMemo(
    () => maintenanceCategoryInputSchema(maintenanceCategoryMessages(t)),
    [t]
  );

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<MaintenanceCategoryFormInput, unknown, MaintenanceCategoryInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      nameAr: '',
      nameEn: '',
      slug: '',
      descriptionAr: '',
      descriptionEn: '',
      imageUrl: '',
      sortOrder: 0,
    },
  });

  const imageValue = useWatch({ control, name: 'imageUrl' });
  const nameEnValue = useWatch({ control, name: 'nameEn' });
  const { markSlugTouched } = useAutoSlug<MaintenanceCategoryFormInput>({
    enabled: mode === 'create',
    source: nameEnValue ?? '',
    slug: 'slug',
    setValue,
  });
  // `register` owns onChange, so the touched flag rides along with it rather
  // than replacing it.
  const slugField = register('slug');

  async function onSubmit(values: MaintenanceCategoryInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createMaintenanceCategory(values)
        : await updateMaintenanceCategory(categoryId ?? '', values);
    if (result.ok) {
      router.push('/maintenance-categories?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof MaintenanceCategoryInput, {
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
    // `pb-24` reserves the height of the sticky action bar, so the last
    // section can be scrolled clear of it.
    <form
      onSubmit={handleSubmit(onSubmit)}
      noValidate
      className="mt-6 grid gap-6 pb-24 text-start"
    >
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title={common('sectionBasic')}>
          <div className="grid gap-5">
            <Field
              id="maintenance-category-slug"
              label={t('form.slug')}
              error={errors.slug?.message}
            >
              <input
                id="maintenance-category-slug"
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
              id="maintenance-category-sort-order"
              label={t('form.sortOrder')}
              error={errors.sortOrder?.message}
            >
              <input
                id="maintenance-category-sort-order"
                type="number"
                min={0}
                step={1}
                className={inputClasses}
                {...register('sortOrder', { valueAsNumber: true })}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionFiles')}>
          <div className="grid gap-5">
            <Field
              id="maintenance-category-image"
              label={t('form.imageUrl')}
              error={errors.imageUrl?.message}
            >
              <UploadField
                id="maintenance-category-image"
                kind="image"
                value={imageValue ?? ''}
                onUploaded={(url) => {
                  setValue('imageUrl', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('imageUrl');
                }}
                onClear={() =>
                  setValue('imageUrl', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('imageUrl')}
              />
            </Field>
            <p className="text-sm text-stone-600">{t('form.imageHint')}</p>
          </div>
        </Card>
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="maintenance-category-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="maintenance-category-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
            <Field
              id="maintenance-category-description-ar"
              label={t('form.descriptionAr')}
              error={errors.descriptionAr?.message}
            >
              <textarea
                id="maintenance-category-description-ar"
                rows={5}
                dir="rtl"
                className={inputClasses}
                {...register('descriptionAr')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionEnglish')}>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="maintenance-category-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="maintenance-category-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
            <Field
              id="maintenance-category-description-en"
              label={t('form.descriptionEn')}
              error={errors.descriptionEn?.message}
            >
              <textarea
                id="maintenance-category-description-en"
                rows={5}
                dir="ltr"
                className={inputClasses}
                {...register('descriptionEn')}
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
        cancelHref="/maintenance-categories"
      />
    </form>
  );
}
