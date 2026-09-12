'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { createNews, updateNews } from '@/lib/actions/news';
import { newsInputSchema, type NewsInput } from '@/lib/schemas';

type NewsFormProps = {
  mode: 'create' | 'edit';
  newsId?: string;
  defaultValues?: NewsInput;
};

const MESSAGES = {
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  titleAr: 'Arabic title must be at least 2 characters.',
  titleEn: 'English title must be at least 2 characters.',
  bodyAr: 'Arabic body must be at least 10 characters.',
  bodyEn: 'English body must be at least 10 characters.',
  publishedAt: 'Published date must be a valid YYYY-MM-DD date.',
};

export function NewsForm({ mode, newsId, defaultValues }: NewsFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => newsInputSchema(MESSAGES), []);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<NewsInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      slug: '',
      titleAr: '',
      titleEn: '',
      bodyAr: '',
      bodyEn: '',
      image: '',
      publishedAt: new Date().toISOString().slice(0, 10),
    },
  });

  async function onSubmit(values: NewsInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createNews(values)
        : await updateNews(newsId ?? '', values);
    if (result.ok) {
      router.push('/news');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof NewsInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'slug_taken'
        ? 'That slug is already used by another post.'
        : result.error === 'unauthorized'
          ? 'Your session expired. Log in again.'
          : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New post' : 'Edit post'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="news-title-en"
          label="Title (English)"
          error={errors.titleEn?.message}
        >
          <input
            id="news-title-en"
            type="text"
            className={inputClasses}
            {...register('titleEn')}
          />
        </Field>
        <Field
          id="news-title-ar"
          label="Title (Arabic)"
          error={errors.titleAr?.message}
        >
          <input
            id="news-title-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('titleAr')}
          />
        </Field>
        <Field id="news-slug" label="Slug" error={errors.slug?.message}>
          <input
            id="news-slug"
            type="text"
            autoComplete="off"
            className={inputClasses}
            {...register('slug')}
          />
        </Field>
        <Field
          id="news-body-en"
          label="Body (English)"
          error={errors.bodyEn?.message}
        >
          <textarea
            id="news-body-en"
            rows={5}
            className={inputClasses}
            {...register('bodyEn')}
          />
        </Field>
        <Field
          id="news-body-ar"
          label="Body (Arabic)"
          error={errors.bodyAr?.message}
        >
          <textarea
            id="news-body-ar"
            rows={5}
            dir="auto"
            className={inputClasses}
            {...register('bodyAr')}
          />
        </Field>
        <Field
          id="news-image"
          label="Image URL (optional)"
          error={errors.image?.message}
        >
          <input
            id="news-image"
            type="text"
            autoComplete="off"
            placeholder="https://… (real uploads arrive in Phase 16)"
            className={inputClasses}
            {...register('image')}
          />
        </Field>
        {/* TODO(Phase 16): replace the URL text input with a real upload
            experience once a storage backend is picked. */}
        <Field
          id="news-published"
          label="Published date"
          error={errors.publishedAt?.message}
        >
          <input
            id="news-published"
            type="date"
            className={inputClasses}
            {...register('publishedAt')}
          />
        </Field>
        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create post' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
