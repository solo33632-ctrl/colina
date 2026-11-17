'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { createEditor } from '@/lib/actions/users';
import { adminUserMessages } from '@/lib/actions/validation-messages';
import {
  ADMIN_PASSWORD_MIN_LENGTH,
  adminUserCreateSchema,
  type AdminUserCreateInput,
} from '@/lib/schemas';

export function EditorForm() {
  const t = useTranslations('Users');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () => adminUserCreateSchema(adminUserMessages(t)),
    [t]
  );

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<AdminUserCreateInput>({
    resolver: zodResolver(schema),
    defaultValues: { name: '', email: '', password: '' },
  });

  async function onSubmit(values: AdminUserCreateInput) {
    setFormError(null);
    const result = await createEditor(values);
    if (result.ok) {
      router.push('/users?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof AdminUserCreateInput, {
          message: issue.message,
        });
      }
      return;
    }
    setFormError(
      result.error === 'email_taken'
        ? t('createForm.emailTaken')
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
      <Card title={common('sectionBasic')}>
        <div className="grid gap-5">
          <Field
            id="user-name"
            label={t('createForm.name')}
            error={errors.name?.message}
          >
            <input
              id="user-name"
              type="text"
              autoComplete="off"
              className={inputClasses}
              {...register('name')}
            />
          </Field>
          <Field
            id="user-email"
            label={t('createForm.email')}
            error={errors.email?.message}
          >
            <input
              id="user-email"
              type="email"
              dir="ltr"
              autoComplete="off"
              className={inputClasses}
              {...register('email')}
            />
          </Field>
          <Field
            id="user-password"
            label={t('createForm.password')}
            error={errors.password?.message}
          >
            <input
              id="user-password"
              type="password"
              dir="ltr"
              autoComplete="new-password"
              className={inputClasses}
              {...register('password')}
            />
            <p className="mt-1 text-xs text-stone-500">
              {t('createForm.passwordHint', {
                min: ADMIN_PASSWORD_MIN_LENGTH,
              })}
            </p>
          </Field>
        </div>
      </Card>

      {formError ? (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-700"
        >
          {formError}
        </p>
      ) : null}

      <FormActions
        submitLabel={t('createForm.submit')}
        isSubmitting={isSubmitting}
        cancelHref="/users"
      />
    </form>
  );
}
