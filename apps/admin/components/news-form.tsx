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
import { createNews, updateNews } from '@/lib/actions/news';
import { newsMessages } from '@/lib/actions/validation-messages';
import { newsInputSchema, type NewsInput } from '@/lib/schemas';

type NewsFormProps = {
  mode: 'create' | 'edit';
  newsId?: string;
  defaultValues?: NewsInput;
};

export function NewsForm({ mode, newsId, defaultValues }: NewsFormProps) {
  const t = useTranslations('News');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => newsInputSchema(newsMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
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

  const imageValue = useWatch({ control, name: 'image' });
  const titleEnValue = useWatch({ control, name: 'titleEn' });
  const { markSlugTouched } = useAutoSlug<NewsInput>({
    enabled: mode === 'create',
    source: titleEnValue ?? '',
    slug: 'slug',
    setValue,
  });
  const slugField = register('slug');

  async function onSubmit(values: NewsInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createNews(values)
        : await updateNews(newsId ?? '', values);
    if (result.ok) {
      router.push('/news?saved=1');
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
        <Card title={common('sectionBasic')}>
          <div className="grid gap-5">
            <Field
              id="news-slug"
              label={t('form.slug')}
              error={errors.slug?.message}
            >
              <input
                id="news-slug"
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
              id="news-published"
              label={t('form.publishedAt')}
              error={errors.publishedAt?.message}
            >
              <input
                id="news-published"
                type="date"
                dir="ltr"
                className={inputClasses}
                {...register('publishedAt')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionFiles')}>
          <div className="grid gap-5">
            <Field
              id="news-image"
              label={t('form.image')}
              error={errors.image?.message}
            >
              <UploadField
                id="news-image"
                kind="image"
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
              id="news-title-ar"
              label={t('form.titleAr')}
              error={errors.titleAr?.message}
            >
              <input
                id="news-title-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('titleAr')}
              />
            </Field>
            <Field
              id="news-body-ar"
              label={t('form.bodyAr')}
              error={errors.bodyAr?.message}
            >
              <textarea
                id="news-body-ar"
                rows={6}
                dir="rtl"
                className={inputClasses}
                {...register('bodyAr')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionEnglish')}>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="news-title-en"
              label={t('form.titleEn')}
              error={errors.titleEn?.message}
            >
              <input
                id="news-title-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('titleEn')}
              />
            </Field>
            <Field
              id="news-body-en"
              label={t('form.bodyEn')}
              error={errors.bodyEn?.message}
            >
              <textarea
                id="news-body-en"
                rows={6}
                dir="ltr"
                className={inputClasses}
                {...register('bodyEn')}
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
        cancelHref="/news"
      />
    </form>
  );
}
