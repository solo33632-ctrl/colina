'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { createService, updateService } from '@/lib/actions/services';
import { serviceInputSchema, type ServiceInput } from '@/lib/schemas';

type ServiceFormProps = {
  mode: 'create' | 'edit';
  serviceId?: string;
  defaultValues?: ServiceInput;
};

const MESSAGES = {
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  titleAr: 'Arabic title must be at least 2 characters.',
  titleEn: 'English title must be at least 2 characters.',
  descriptionAr: 'Arabic description must be at least 10 characters.',
  descriptionEn: 'English description must be at least 10 characters.',
  scopeAr: 'Arabic scope must be at least 10 characters.',
  scopeEn: 'English scope must be at least 10 characters.',
  icon: 'Icon must not be empty.',
};

export function ServiceForm({
  mode,
  serviceId,
  defaultValues,
}: ServiceFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => serviceInputSchema(MESSAGES), []);

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
        ? 'That slug is already used by another service.'
        : result.error === 'unauthorized'
          ? 'Your session expired. Log in again.'
          : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New service' : 'Edit service'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="service-title-en"
          label="Title (English)"
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
          label="Title (Arabic)"
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
        <Field id="service-slug" label="Slug" error={errors.slug?.message}>
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
          label="Description (English)"
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
          label="Description (Arabic)"
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
          label="Scope (English)"
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
          label="Scope (Arabic)"
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
        <Field id="service-icon" label="Icon name" error={errors.icon?.message}>
          <input
            id="service-icon"
            type="text"
            autoComplete="off"
            placeholder="e.g. wrench (plain text, no picker yet)"
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
            {mode === 'create' ? 'Create service' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
