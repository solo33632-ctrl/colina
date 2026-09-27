'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { UploadField } from './upload-field';
import { createCategory, updateCategory } from '@/lib/actions/categories';
import { categoryMessages } from '@/lib/actions/validation-messages';
import { categoryInputSchema, type CategoryInput } from '@/lib/schemas';

type CategoryFormProps = {
  mode: 'create' | 'edit';
  categoryId?: string;
  defaultValues?: CategoryInput;
};

export function CategoryForm({
  mode,
  categoryId,
  defaultValues,
}: CategoryFormProps) {
  const t = useTranslations('Categories');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

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
    },
  });

  const imageValue = useWatch({ control, name: 'image' });

  async function onSubmit(values: CategoryInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createCategory(values)
        : await updateCategory(categoryId ?? '', values);
    if (result.ok) {
      router.push('/categories');
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
    <Card
      title={mode === 'create' ? t('form.createTitle') : t('form.editTitle')}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="cat-name-en"
          label={t('form.nameEn')}
          error={errors.nameEn?.message}
        >
          <input
            id="cat-name-en"
            type="text"
            className={inputClasses}
            {...register('nameEn')}
          />
        </Field>
        <Field
          id="cat-name-ar"
          label={t('form.nameAr')}
          error={errors.nameAr?.message}
        >
          <input
            id="cat-name-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('nameAr')}
          />
        </Field>
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
            {...register('slug')}
          />
        </Field>
        <Field
          id="cat-description-en"
          label={t('form.descriptionEn')}
          error={errors.descriptionEn?.message}
        >
          <textarea
            id="cat-description-en"
            rows={3}
            className={inputClasses}
            {...register('descriptionEn')}
          />
        </Field>
        <Field
          id="cat-description-ar"
          label={t('form.descriptionAr')}
          error={errors.descriptionAr?.message}
        >
          <textarea
            id="cat-description-ar"
            rows={3}
            dir="auto"
            className={inputClasses}
            {...register('descriptionAr')}
          />
        </Field>
        <Field
          id="cat-image"
          label={t('form.image')}
          error={errors.image?.message}
        >
          <UploadField
            id="cat-image"
            kind="image"
            value={imageValue ?? ''}
            onUploaded={(url) => {
              setValue('image', url, {
                shouldValidate: true,
                shouldDirty: true,
              });
              clearErrors('image');
            }}
            urlInputProps={register('image')}
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
