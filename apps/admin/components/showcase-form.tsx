'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useLocale, useTranslations } from 'next-intl';
import { Link, useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { UploadField } from './upload-field';
import { createShowcase, updateShowcase } from '@/lib/actions/showcase';
import { showcaseMessages } from '@/lib/actions/validation-messages';
import { showcaseInputSchema, type ShowcaseInput } from '@/lib/schemas';

export type MaintenanceCategoryOption = {
  id: string;
  nameEn: string;
  nameAr: string;
};

type ShowcaseFormProps = {
  mode: 'create' | 'edit';
  showcaseId?: string;
  categories: MaintenanceCategoryOption[];
  defaultValues?: ShowcaseInput;
};

export function ShowcaseForm({
  mode,
  showcaseId,
  categories,
  defaultValues,
}: ShowcaseFormProps) {
  const t = useTranslations('MaintenanceShowcase');
  const common = useTranslations('Common');
  const locale = useLocale();
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => showcaseInputSchema(showcaseMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<ShowcaseInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      nameAr: '',
      nameEn: '',
      categoryId: '',
      descriptionAr: '',
      descriptionEn: '',
      beforeImageUrl: '',
      afterImageUrl: '',
    },
  });

  const beforeValue = useWatch({ control, name: 'beforeImageUrl' });
  const afterValue = useWatch({ control, name: 'afterImageUrl' });

  async function onSubmit(values: ShowcaseInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createShowcase(values)
        : await updateShowcase(showcaseId ?? '', values);
    if (result.ok) {
      router.push('/maintenance-showcase?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof ShowcaseInput, {
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
        <Card title={common('sectionBasic')} className="lg:col-span-2">
          <div className="grid gap-5">
            <Field
              id="showcase-category"
              label={t('form.category')}
              error={errors.categoryId?.message}
            >
              <select
                id="showcase-category"
                dir={locale === 'ar' ? 'rtl' : 'ltr'}
                className={inputClasses}
                {...register('categoryId')}
              >
                <option value="">{t('form.chooseCategory')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {locale === 'ar'
                      ? category.nameAr || category.nameEn
                      : category.nameEn || category.nameAr}
                  </option>
                ))}
              </select>
            </Field>
            {categories.length === 0 ? (
              <p className="text-sm text-stone-600">
                {t('form.noCategories')}{' '}
                <Link
                  href="/maintenance-categories/new"
                  className="font-medium text-brand-700 underline hover:text-brand-800"
                >
                  {t('form.createCategoryLink')}
                </Link>
              </p>
            ) : null}
          </div>
        </Card>
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="showcase-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="showcase-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
            <Field
              id="showcase-description-ar"
              label={t('form.descriptionAr')}
              error={errors.descriptionAr?.message}
            >
              <textarea
                id="showcase-description-ar"
                rows={4}
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
              id="showcase-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="showcase-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
            <Field
              id="showcase-description-en"
              label={t('form.descriptionEn')}
              error={errors.descriptionEn?.message}
            >
              <textarea
                id="showcase-description-en"
                rows={4}
                dir="ltr"
                className={inputClasses}
                {...register('descriptionEn')}
              />
            </Field>
          </div>
        </Card>
        {/* Two fields, not one list: the pair is the whole point of the record,
            so before and after get equal weight and their own labels rather
            than being rows of a "photos" table an admin has to interpret. */}
        <Card title={common('sectionFiles')} className="lg:col-span-2">
          <div className="grid gap-6 lg:grid-cols-2">
            <Field
              id="showcase-before"
              label={t('form.beforeImageUrl')}
              error={errors.beforeImageUrl?.message}
            >
              <UploadField
                id="showcase-before"
                kind="image"
                value={beforeValue ?? ''}
                onUploaded={(url) => {
                  setValue('beforeImageUrl', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('beforeImageUrl');
                }}
                onClear={() =>
                  setValue('beforeImageUrl', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('beforeImageUrl')}
                uploadAriaLabel={t('form.uploadBeforePhoto')}
                pasteUrlAriaLabel={t('form.pasteUrlBeforePhoto')}
                clearAriaLabel={t('form.removeBeforePhoto')}
              />
            </Field>
            <Field
              id="showcase-after"
              label={t('form.afterImageUrl')}
              error={errors.afterImageUrl?.message}
            >
              <UploadField
                id="showcase-after"
                kind="image"
                value={afterValue ?? ''}
                onUploaded={(url) => {
                  setValue('afterImageUrl', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('afterImageUrl');
                }}
                onClear={() =>
                  setValue('afterImageUrl', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('afterImageUrl')}
                uploadAriaLabel={t('form.uploadAfterPhoto')}
                pasteUrlAriaLabel={t('form.pasteUrlAfterPhoto')}
                clearAriaLabel={t('form.removeAfterPhoto')}
              />
            </Field>
          </div>
          {/* The comparison only works when the two halves line up, and nothing
              in the image data says whether they do — it is a judgement the
              admin can only make by looking. Stated once, under both fields,
              rather than as a second warning on each. */}
          <p className="mt-5 text-sm text-stone-600">{t('form.photoHint')}</p>
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
        cancelHref="/maintenance-showcase"
      />
    </form>
  );
}
