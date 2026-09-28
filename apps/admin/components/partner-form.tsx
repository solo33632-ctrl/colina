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
import { createPartner, updatePartner } from '@/lib/actions/partners';
import { partnerMessages } from '@/lib/actions/validation-messages';
import { partnerInputSchema, type PartnerInput } from '@/lib/schemas';

type PartnerFormProps = {
  mode: 'create' | 'edit';
  partnerId?: string;
  defaultValues?: PartnerInput;
};

export function PartnerForm({
  mode,
  partnerId,
  defaultValues,
}: PartnerFormProps) {
  const t = useTranslations('Partners');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => partnerInputSchema(partnerMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<PartnerInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? { nameAr: '', nameEn: '', logo: '' },
  });

  const logoValue = useWatch({ control, name: 'logo' });

  async function onSubmit(values: PartnerInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createPartner(values)
        : await updatePartner(partnerId ?? '', values);
    if (result.ok) {
      router.push('/partners?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        setError(issue.field as keyof PartnerInput, {
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
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="partner-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="partner-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionEnglish')}>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="partner-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="partner-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
          </div>
        </Card>
        {/* No "Basic info" section here: a partner has no slug and no
            language-neutral field, so the section would be an empty card. */}
        <Card title={common('sectionFiles')} className="lg:col-span-2">
          <div className="grid gap-5">
            <Field
              id="partner-logo"
              label={t('form.logo')}
              error={errors.logo?.message}
            >
              <UploadField
                id="partner-logo"
                kind="image"
                value={logoValue ?? ''}
                onUploaded={(url) => {
                  setValue('logo', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('logo');
                }}
                onClear={() =>
                  setValue('logo', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('logo')}
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
        cancelHref="/partners"
      />
    </form>
  );
}
