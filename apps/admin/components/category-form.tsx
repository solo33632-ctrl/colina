'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { UploadField } from './upload-field';
import { createCategory, updateCategory } from '@/lib/actions/categories';
import { categoryInputSchema, type CategoryInput } from '@/lib/schemas';

type CategoryFormProps = {
  mode: 'create' | 'edit';
  categoryId?: string;
  defaultValues?: CategoryInput;
};

const MESSAGES = {
  nameAr: 'Arabic name must be at least 2 characters.',
  nameEn: 'English name must be at least 2 characters.',
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  descriptionAr: 'Arabic description must be at least 10 characters.',
  descriptionEn: 'English description must be at least 10 characters.',
  image: 'Image must be an absolute http(s) URL or empty.',
};

export function CategoryForm({
  mode,
  categoryId,
  defaultValues,
}: CategoryFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => categoryInputSchema(MESSAGES), []);

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
        ? 'That slug is already used by another category.'
        : result.error === 'unauthorized'
          ? 'Your session expired. Log in again.'
          : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New category' : 'Edit category'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="cat-name-en"
          label="Name (English)"
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
          label="Name (Arabic)"
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
        <Field id="cat-slug" label="Slug" error={errors.slug?.message}>
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
          label="Description (English)"
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
          label="Description (Arabic)"
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
          label="Image (optional)"
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
            {mode === 'create' ? 'Create category' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
