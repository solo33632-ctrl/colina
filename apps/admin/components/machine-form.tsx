'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Button, Card } from '@colina/ui';
import { Field, inputClasses } from './form-fields';
import { createMachine, updateMachine } from '@/lib/actions/machines';
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

const MESSAGES = {
  nameAr: 'Arabic name must be at least 2 characters.',
  nameEn: 'English name must be at least 2 characters.',
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  categoryId: 'Choose a category.',
  shortDescriptionAr:
    'Arabic short description must be at least 10 characters.',
  shortDescriptionEn:
    'English short description must be at least 10 characters.',
  descriptionAr: 'Arabic description must be at least 10 characters.',
  descriptionEn: 'English description must be at least 10 characters.',
  specsAr: 'Arabic specs must not be empty.',
  specsEn: 'English specs must not be empty.',
  imageUrl: 'Image URL must not be empty.',
  imagePosition: 'Image position must be 0 or higher.',
};

export function MachineForm({
  mode,
  machineId,
  categories,
  machines,
  defaultValues,
}: MachineFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(() => machineInputSchema(MESSAGES), []);

  const {
    register,
    control,
    handleSubmit,
    setError,
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
      router.push('/machines');
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
        ? 'That slug is already used by another machine.'
        : result.error === 'unauthorized'
          ? 'Your session expired. Log in again.'
          : 'Saving failed. Try again.'
    );
  }

  return (
    <Card title={mode === 'create' ? 'New machine' : 'Edit machine'}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        noValidate
        className="mt-4 grid gap-5 text-start"
      >
        <Field
          id="machine-name-en"
          label="Name (English)"
          error={errors.nameEn?.message}
        >
          <input
            id="machine-name-en"
            type="text"
            className={inputClasses}
            {...register('nameEn')}
          />
        </Field>
        <Field
          id="machine-name-ar"
          label="Name (Arabic)"
          error={errors.nameAr?.message}
        >
          <input
            id="machine-name-ar"
            type="text"
            dir="auto"
            className={inputClasses}
            {...register('nameAr')}
          />
        </Field>
        <Field id="machine-slug" label="Slug" error={errors.slug?.message}>
          <input
            id="machine-slug"
            type="text"
            autoComplete="off"
            className={inputClasses}
            {...register('slug')}
          />
        </Field>
        <Field
          id="machine-category"
          label="Category"
          error={errors.categoryId?.message}
        >
          <select
            id="machine-category"
            className={inputClasses}
            {...register('categoryId')}
          >
            <option value="">Choose a category…</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.nameEn}
              </option>
            ))}
          </select>
        </Field>
        <Field
          id="machine-short-en"
          label="Short description (English)"
          error={errors.shortDescriptionEn?.message}
        >
          <textarea
            id="machine-short-en"
            rows={2}
            className={inputClasses}
            {...register('shortDescriptionEn')}
          />
        </Field>
        <Field
          id="machine-short-ar"
          label="Short description (Arabic)"
          error={errors.shortDescriptionAr?.message}
        >
          <textarea
            id="machine-short-ar"
            rows={2}
            dir="auto"
            className={inputClasses}
            {...register('shortDescriptionAr')}
          />
        </Field>
        <Field
          id="machine-desc-en"
          label="Full description (English)"
          error={errors.descriptionEn?.message}
        >
          <textarea
            id="machine-desc-en"
            rows={4}
            className={inputClasses}
            {...register('descriptionEn')}
          />
        </Field>
        <Field
          id="machine-desc-ar"
          label="Full description (Arabic)"
          error={errors.descriptionAr?.message}
        >
          <textarea
            id="machine-desc-ar"
            rows={4}
            dir="auto"
            className={inputClasses}
            {...register('descriptionAr')}
          />
        </Field>
        <Field
          id="machine-specs-en"
          label="Specs (English)"
          error={errors.specsEn?.message}
        >
          <textarea
            id="machine-specs-en"
            rows={3}
            className={inputClasses}
            {...register('specsEn')}
          />
        </Field>
        <Field
          id="machine-specs-ar"
          label="Specs (Arabic)"
          error={errors.specsAr?.message}
        >
          <textarea
            id="machine-specs-ar"
            rows={3}
            dir="auto"
            className={inputClasses}
            {...register('specsAr')}
          />
        </Field>
        <Field
          id="machine-datasheet"
          label="Datasheet URL (optional)"
          error={errors.datasheetUrl?.message}
        >
          <input
            id="machine-datasheet"
            type="text"
            autoComplete="off"
            placeholder="https://… (real uploads arrive in Phase 16)"
            className={inputClasses}
            {...register('datasheetUrl')}
          />
        </Field>
        {/* TODO(Phase 16): replace URL text inputs with a real upload
            experience once a storage backend is picked (S3 / Cloudinary /
            Supabase Storage). No shared filesystem exists between the two
            deployments, so a local upload now would be throwaway. */}
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-stone-700">
            Images (ordered by position)
          </legend>
          <ul className="grid gap-3">
            {imageFields.map((field, index) => (
              <li key={field.id} className="flex items-start gap-2">
                <input
                  type="text"
                  placeholder="Image URL"
                  aria-label={`Image ${index + 1} URL`}
                  className={inputClasses}
                  {...register(`images.${index}.url`)}
                />
                <input
                  type="number"
                  min={0}
                  aria-label={`Image ${index + 1} position`}
                  className="w-20 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
                  {...register(`images.${index}.position`, {
                    valueAsNumber: true,
                  })}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => removeImage(index)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          {errors.images?.message ? (
            <p role="alert" className="mt-1 text-sm font-medium text-red-700">
              {errors.images.message}
            </p>
          ) : null}
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() =>
                appendImage({ url: '', position: imageFields.length })
              }
            >
              Add image
            </Button>
          </div>
        </fieldset>
        <fieldset>
          <legend className="mb-1 block text-sm font-medium text-stone-700">
            Related machines
          </legend>
          {relatedOptions.length === 0 ? (
            <p className="text-sm text-stone-500">
              No other machines exist yet.
            </p>
          ) : (
            <ul className="grid gap-2">
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
        </fieldset>
        {formError ? (
          <p role="alert" className="text-sm font-medium text-red-700">
            {formError}
          </p>
        ) : null}
        <div>
          <Button type="submit" disabled={isSubmitting}>
            {mode === 'create' ? 'Create machine' : 'Save changes'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
