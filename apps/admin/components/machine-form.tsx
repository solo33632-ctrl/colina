'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslations } from 'next-intl';
import { useRouter } from '@/i18n/navigation';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { FormActions } from './form-actions';
import { GalleryAddTile } from './gallery-add-tile';
import { Icon } from './icons';
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
    swap: swapImages,
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

  // Per-image error reader. The gallery validates `images[n].url`, and
  // `onSubmit` already routes a server-side issue to exactly that path, but
  // react-hook-form types an array field's errors as either a FieldError or
  // the nested record, so both shapes are unwrapped here. Without a rendered
  // error for this path an invalid image URL blocks the submit and says
  // nothing, which is what made seeded machines impossible to save.
  function imageUrlError(index: number): string | undefined {
    const fieldError = errors.images?.[index];
    const urlError = fieldError?.url;
    if (urlError && typeof urlError === 'object' && 'message' in urlError) {
      const { message } = urlError;
      return typeof message === 'string' && message ? message : undefined;
    }
    return undefined;
  }

  async function onSubmit(values: MachineInput) {
    setFormError(null);
    // The gallery's order is the order the rows are displayed in, so the
    // position is written from the index here rather than being typed by the
    // admin. The Server Action re-normalises on write; doing it on submit too
    // keeps the payload honest about what the admin sees.
    const payload: MachineInput = {
      ...values,
      images: (values.images ?? []).map((image, index) => ({
        url: image.url,
        position: index,
      })),
    };
    const result =
      mode === 'create'
        ? await createMachine(payload)
        : await updateMachine(machineId ?? '', payload);
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
                uploadAriaLabel={t('form.uploadPdfFor')}
                pasteUrlAriaLabel={t('form.pasteUrlDatasheetFor')}
                clearAriaLabel={t('form.removeDatasheet')}
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
                  // `flex-wrap` stops the row's min-content being the sum of its
                  // widest children (the 160px preview plus the controls beside
                  // it), which otherwise forces this card — and so the whole form
                  // grid — past a 390px screen whenever a machine already has
                  // images. The row already wrapped at that width, so this only
                  // corrects the min-content, it does not restyle the row.
                  <li
                    key={field.id}
                    className="flex flex-wrap items-start gap-2"
                  >
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
                        // One field per row means one "Remove"/"Upload" per row,
                        // so each control names the row it acts on. The visible
                        // labels stay generic.
                        uploadAriaLabel={t('form.uploadImageFor', {
                          number: index + 1,
                        })}
                        pasteUrlAriaLabel={t('form.pasteUrlFor', {
                          number: index + 1,
                        })}
                        clearAriaLabel={t('form.clearImageFor', {
                          number: index + 1,
                        })}
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Reorder instead of asking the admin to type a
                          position: the number input could silently disagree
                          with the order the rows are shown in. */}
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={index === 0}
                        onClick={() => swapImages(index, index - 1)}
                        aria-label={t('form.moveEarlier', {
                          number: index + 1,
                        })}
                        title={t('form.moveEarlier', { number: index + 1 })}
                      >
                        <Icon name="moveUp" className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        disabled={index === imageFields.length - 1}
                        onClick={() => swapImages(index, index + 1)}
                        aria-label={t('form.moveLater', {
                          number: index + 1,
                        })}
                        title={t('form.moveLater', { number: index + 1 })}
                      >
                        <Icon name="moveDown" className="h-4 w-4" />
                      </Button>
                      <span className="w-8 text-center text-xs tabular-nums text-stone-500">
                        <span className="sr-only">
                          {t('form.imagePosition', { number: index + 1 })}
                        </span>
                        <span aria-hidden="true">{index + 1}</span>
                      </span>
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={() => removeImage(index)}
                        aria-label={t('form.removeImageFor', {
                          number: index + 1,
                        })}
                      >
                        {t('form.removeImage')}
                      </Button>
                    </div>
                    {imageUrlError(index) ? (
                      <p
                        role="alert"
                        className="basis-full text-sm font-medium text-red-700"
                      >
                        {imageUrlError(index)}
                      </p>
                    ) : null}
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
              <GalleryAddTile
                onAdded={(url) => {
                  appendImage({ url, position: imageFields.length });
                }}
              />
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
