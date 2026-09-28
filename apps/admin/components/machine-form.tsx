'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { UploadField } from './upload-field';
import { useAutoSlug } from './use-auto-slug';
import { createMachine, updateMachine } from '@/lib/actions/machines';
import { machineMessages } from '@/lib/actions/validation-messages';
import { machineInputSchema, type MachineInput } from '@/lib/schemas';

export type MachineOption = {
  id: string;
  nameEn: string;
};

export type CategoryOption = {
  id: string;
  nameEn: string;
};

type MachineFormProps = {
  mode: 'create' | 'edit';
  machineId?: string;
  categories: CategoryOption[];
  machines: MachineOption[];
  defaultValues?: MachineInput;
};

export function MachineForm({
  mode,
  machineId,
  categories,
  machines,
  defaultValues,
}: MachineFormProps) {
  const t = useTranslations('Machines');
  const common = useTranslations('Common');
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  // Same message namespace the Server Action validates against.
  const schema = useMemo(() => machineInputSchema(machineMessages(t)), [t]);

  const {
    register,
    control,
    handleSubmit,
    setError,
    setValue,
    clearErrors,
    formState: { errors, isSubmitting },
  } = useForm<MachineInput>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues ?? {
      nameAr: '',
      nameEn: '',
      slug: '',
      categoryId: '',
      shortDescriptionAr: '',
      shortDescriptionEn: '',
      descriptionAr: '',
      descriptionEn: '',
      specsAr: '',
      specsEn: '',
      datasheetUrl: '',
      images: [],
      relatedIds: [],
    },
  });

  const {
    fields: imageFields,
    append: appendImage,
    remove: removeImage,
  } = useFieldArray({ control, name: 'images' });

  const datasheetValue = useWatch({ control, name: 'datasheetUrl' });
  const imagesValue = useWatch({ control, name: 'images' });
  const nameEnValue = useWatch({ control, name: 'nameEn' });

  const { markSlugTouched } = useAutoSlug<MachineInput>({
    enabled: mode === 'create',
    source: nameEnValue ?? '',
    slug: 'slug',
    setValue,
  });
  const slugField = register('slug');

  // Related-machine candidates exclude the machine being edited (no
  // self-links); the server drops them defensively too.
  const relatedOptions = machines.filter((machine) => machine.id !== machineId);

  async function onSubmit(values: MachineInput) {
    setFormError(null);
    const result =
      mode === 'create'
        ? await createMachine(values)
        : await updateMachine(machineId ?? '', values);
    if (result.ok) {
      router.push('/machines?saved=1');
      router.refresh();
      return;
    }
    if (result.error === 'validation_failed' && result.issues) {
      for (const issue of result.issues) {
        const [top, indexRaw, nested] = issue.field.split('.');
        if (top === 'images' && (nested === 'url' || nested === 'position')) {
          const index = Number(indexRaw);
          if (Number.isInteger(index)) {
            setError(`images.${index}.${nested}`, {
              message: issue.message,
            });
            continue;
          }
        }
        setError(top as keyof MachineInput, { message: issue.message });
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
              id="machine-slug"
              label={t('form.slug')}
              error={errors.slug?.message}
            >
              <input
                id="machine-slug"
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
              id="machine-category"
              label={t('form.category')}
              error={errors.categoryId?.message}
            >
              <select
                id="machine-category"
                dir="ltr"
                className={inputClasses}
                {...register('categoryId')}
              >
                <option value="">{t('form.chooseCategory')}</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.nameEn}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        </Card>
        <Card title={t('form.relatedLegend')}>
          {relatedOptions.length === 0 ? (
            <p className="text-sm text-stone-500">{t('form.noRelated')}</p>
          ) : (
            <ul className="grid max-h-64 gap-2 overflow-y-auto">
              {relatedOptions.map((machine) => (
                <li key={machine.id}>
                  <label className="flex items-center gap-2 text-sm text-stone-700">
                    <input
                      type="checkbox"
                      value={machine.id}
                      {...register('relatedIds')}
                    />
                    {machine.nameEn}
                  </label>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title={common('sectionArabic')}>
          <div dir="rtl" className="grid gap-5">
            <Field
              id="machine-name-ar"
              label={t('form.nameAr')}
              error={errors.nameAr?.message}
            >
              <input
                id="machine-name-ar"
                type="text"
                dir="rtl"
                className={inputClasses}
                {...register('nameAr')}
              />
            </Field>
            <Field
              id="machine-short-ar"
              label={t('form.shortDescriptionAr')}
              error={errors.shortDescriptionAr?.message}
            >
              <textarea
                id="machine-short-ar"
                rows={2}
                dir="rtl"
                className={inputClasses}
                {...register('shortDescriptionAr')}
              />
            </Field>
            <Field
              id="machine-desc-ar"
              label={t('form.descriptionAr')}
              error={errors.descriptionAr?.message}
            >
              <textarea
                id="machine-desc-ar"
                rows={4}
                dir="rtl"
                className={inputClasses}
                {...register('descriptionAr')}
              />
            </Field>
            <Field
              id="machine-specs-ar"
              label={t('form.specsAr')}
              error={errors.specsAr?.message}
            >
              <textarea
                id="machine-specs-ar"
                rows={3}
                dir="rtl"
                className={inputClasses}
                {...register('specsAr')}
              />
            </Field>
          </div>
        </Card>
        <Card title={common('sectionEnglish')}>
          <div dir="ltr" className="grid gap-5">
            <Field
              id="machine-name-en"
              label={t('form.nameEn')}
              error={errors.nameEn?.message}
            >
              <input
                id="machine-name-en"
                type="text"
                dir="ltr"
                className={inputClasses}
                {...register('nameEn')}
              />
            </Field>
            <Field
              id="machine-short-en"
              label={t('form.shortDescriptionEn')}
              error={errors.shortDescriptionEn?.message}
            >
              <textarea
                id="machine-short-en"
                rows={2}
                dir="ltr"
                className={inputClasses}
                {...register('shortDescriptionEn')}
              />
            </Field>
            <Field
              id="machine-desc-en"
              label={t('form.descriptionEn')}
              error={errors.descriptionEn?.message}
            >
              <textarea
                id="machine-desc-en"
                rows={4}
                dir="ltr"
                className={inputClasses}
                {...register('descriptionEn')}
              />
            </Field>
            <Field
              id="machine-specs-en"
              label={t('form.specsEn')}
              error={errors.specsEn?.message}
            >
              <textarea
                id="machine-specs-en"
                rows={3}
                dir="ltr"
                className={inputClasses}
                {...register('specsEn')}
              />
            </Field>
          </div>
        </Card>
        {/* Gallery and datasheet share the row, and the gallery is given the
            full width below it: the thumbnail grid needs the horizontal room
            more than the datasheet picker does. */}
        <Card title={common('sectionFiles')} className="lg:col-span-2">
          <div className="grid gap-6">
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-stone-700">
                {t('form.datasheet')}
              </legend>
              <UploadField
                id="machine-datasheet"
                kind="datasheet"
                value={datasheetValue ?? ''}
                onUploaded={(url) => {
                  setValue('datasheetUrl', url, {
                    shouldValidate: true,
                    shouldDirty: true,
                  });
                  clearErrors('datasheetUrl');
                }}
                onClear={() =>
                  setValue('datasheetUrl', '', {
                    shouldValidate: true,
                    shouldDirty: true,
                  })
                }
                urlInputProps={register('datasheetUrl')}
              />
              {errors.datasheetUrl?.message ? (
                <p className="mt-1 text-sm text-red-700">
                  {errors.datasheetUrl.message}
                </p>
              ) : null}
            </fieldset>
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-stone-700">
                {t('form.imagesLegend')}
              </legend>
              <ul className="grid gap-3 sm:grid-cols-2">
                {imageFields.map((field, index) => (
                  <li key={field.id} className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <UploadField
                        id={`machine-image-${index}`}
                        kind="image"
                        value={imagesValue?.[index]?.url ?? ''}
                        onUploaded={(url) => {
                          setValue(`images.${index}.url`, url, {
                            shouldValidate: true,
                            shouldDirty: true,
                          });
                          clearErrors(`images.${index}.url`);
                        }}
                        onClear={() =>
                          setValue(`images.${index}.url`, '', {
                            shouldValidate: true,
                            shouldDirty: true,
                          })
                        }
                        urlInputProps={register(`images.${index}.url`)}
                      />
                    </div>
                    <input
                      type="number"
                      min={0}
                      dir="ltr"
                      aria-label={t('form.imagePosition', {
                        number: index + 1,
                      })}
                      className="w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                      {...register(`images.${index}.position`, {
                        valueAsNumber: true,
                      })}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => removeImage(index)}
                    >
                      {t('form.removeImage')}
                    </Button>
                  </li>
                ))}
              </ul>
              {errors.images?.message ? (
                <p
                  role="alert"
                  className="mt-1 text-sm font-medium text-red-700"
                >
                  {errors.images.message}
                </p>
              ) : null}
              <div className="mt-3">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() =>
                    appendImage({ url: '', position: imageFields.length })
                  }
                >
                  {t('form.addImage')}
                </Button>
              </div>
            </fieldset>
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
        cancelHref="/machines"
      />
    </form>
  );
}
