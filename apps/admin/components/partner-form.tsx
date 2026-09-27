'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
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

  // Same message namespace the Server Action validates against.
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
      router.push('/partners');
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
    <Card
      title={mode === 'create' ? t('form.createTitle') : t('form.editTitle')}
    >
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="partner-name-en"
          label={t('form.nameEn')}
          error={errors.nameEn?.message}
        >
          <input
            id="partner-name-en"
            type="text"
            className={inputClasses}
            {...register('nameEn')}
          />
        </Field>
        <Field
          id="partner-name-ar"
          label={t('form.nameAr')}
          error={errors.nameAr?.message}
        >
          <input
            id="partner-name-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('nameAr')}
          />
        </Field>
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
            urlInputProps={register('logo')}
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
