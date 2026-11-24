'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { PublishStatusBadge } from './publish-status-badge';
import { UploadField } from './upload-field';
import { useAutoSlug } from './use-auto-slug';
import { createCategory, updateCategory } from '@/lib/actions/categories';
import { categoryMessages } from '@/lib/actions/validation-messages';
import { categoryInputSchema, type CategoryInput } from '@/lib/schemas';

type CategoryFormProps = {
  mode: 'create' | 'edit';
  categoryId?: string;
  defaultValues?: CategoryInput;
  /** A full admin sees the publish switch; an editor sees the review note. */
  canPublish: boolean;
};

export function CategoryForm({
  mode,
  categoryId,
  defaultValues,
  canPublish,
}: CategoryFormProps) {
  const t = useTranslations('Categories');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Existing category id lets the server verify ownership; create has none.
  const uploadTarget = {
    kind: 'category' as const,
    ...(categoryId ? { id: categoryId } : {}),
  };

  // Same message namespace the Server Action validates against.
  const schema = useMemo(() => categoryInputSchema(categoryMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<CategoryInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      nameAr: '',
      nameEn: '',
      slug: '',
      descriptionAr: '',
      descriptionEn: '',
      image: '',
      isPublished: canPublish,
    },
  });

  const imageValue = useWatch({ control, name: 'image' });
  const nameEnValue = useWatch({ control, name: 'nameEn' });
  const isPublishedValue = useWatch({ control, name: 'isPublished' });
  const { markSlugTouched } = useAutoSlug<CategoryInput>({
    enabled: mode === 'create',
    source: nameEnValue ?? '',
    slug: 'slug',
    setValue,
  });
  // `register` owns onChange, so the touched flag rides along with it rather
  // than replacing it.
  const slugField = register('slug');

  async function onSubmit(values: CategoryInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createCategory(values)
        : await updateCategory(categoryId ?? '', values);
    if (result.ok) {
      router.push('/categories?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof CategoryInput, {
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
              id="cat-slug"
              label={t('form.slug')}
              error={errors.slug?.message}
            >
              <input
                id="cat-slug"
                type="text"
                autoComplete="off"
                className={inputClasses}
                {...slugField}
                onChange={(event) => {
                  markSlugTouched();
                  slugField.onChange(event);
                }}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('visibility')}>
          {canPublish ? (
            <>
              <label
                htmlFor="category-published"
                className="flex w-fit cursor-pointer items-center gap-3"
              >
                <div className="relative grid place-items-center">
                  <input
                    id="category-published"
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
                  {t('form.publish')}
                </span>
              </label>
              <p className="mt-2 text-sm text-stone-500">
                {t('form.publishHelp')}
              </p>
            </>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <PublishStatusBadge published={Boolean(isPublishedValue)}>
                {isPublishedValue ? common('published') : common('draft')}
              </PublishStatusBadge>
              <p className="text-sm text-stone-600">
                {isPublishedValue
                  ? t('form.editorPublishedNote')
                  : t('form.editorDraftNote')}
              </p>
            </div>
          )}
        </Card>
        <Card title={common('sectionFiles')}>
          <div className="grid gap-5">
            <Field
              id="cat-image"
              label={t('form.image')}
              error={errors.image?.message}
            >
              <UploadField
                id="cat-image"
                kind="image"
                target={uploadTarget}
                value={imageValue ?? ''}
                onUploaded={(url) => {
                  setValue('image', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('image');
                }}
                onClear={() =>
                  setValue('image', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('image')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="cat-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="cat-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
            <Field
              id="cat-description-ar"
              label={t('form.descriptionAr')}
              error={errors.descriptionAr?.message}
            >
              <textarea
                id="cat-description-ar"
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
              id="cat-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="cat-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
            <Field
              id="cat-description-en"
              label={t('form.descriptionEn')}
              error={errors.descriptionEn?.message}
            >
              <textarea
                id="cat-description-en"
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
        cancelHref="/categories"
      />
    </form>
  );
}
