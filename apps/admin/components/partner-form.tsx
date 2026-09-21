'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { UploadField } from './upload-field';
import { createPartner, updatePartner } from '@/lib/actions/partners';
import { partnerInputSchema, type PartnerInput } from '@/lib/schemas';

type PartnerFormProps = {
  mode: 'create' | 'edit';
  partnerId?: string;
  defaultValues?: PartnerInput;
};

const MESSAGES = {
  nameAr: 'Arabic name must be at least 2 characters.',
  nameEn: 'English name must be at least 2 characters.',
  logo: 'Logo must be an absolute http(s) URL.',
};

export function PartnerForm({
  mode,
  partnerId,
  defaultValues,
}: PartnerFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => partnerInputSchema(MESSAGES), []);

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
        ? 'Your session expired. Log in again.'
        : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New partner' : 'Edit partner'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="partner-name-en"
          label="Name (English)"
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
          label="Name (Arabic)"
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
        <Field id="partner-logo" label="Logo" error={errors.logo?.message}>
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
            {mode === 'create' ? 'Create partner' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
