'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { inputClasses } from './form-fields';
import { uploadDatasheet, uploadImage } from '@/lib/actions/uploads';
import {
  ACCEPT_BY_KIND,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  PDF_MIME_TYPE,
  type UploadKind,
} from '@/lib/upload-rules';

// Reusable admin upload field: an <input type="file"> that pushes the
// chosen file to Cloudinary through a Server Action and hands the
// resulting secure URL back to the parent form (which stores it into the
// same absolute-URL field as before — the schema never changed, only how
// the admin fills it in).
//
// A collapsed "Or paste a URL" text input stays available as a secondary
// path for content that is already hosted somewhere: flexibility kept,
// upload is now the primary path. `urlInputProps` is the parent form's
// react-hook-form `register(name)` result, so the pasted URL is validated
// by the existing Zod schemas exactly as before.

type UploadFieldProps = {
  id: string;
  kind: UploadKind;
  value: string;
  onUploaded: (url: string) => void;
  urlInputProps: UseFormRegisterReturn;
};

// Displayed limit, derived from the byte constants the action enforces so
// the message can never disagree with the rule.
const MAX_MB = {
  image: MAX_IMAGE_BYTES / (1024 * 1024),
  datasheet: MAX_PDF_BYTES / (1024 * 1024),
} as const;

export function UploadField({
  id,
  kind,
  value,
  onUploaded,
  urlInputProps,
}: UploadFieldProps) {
  const t = useTranslations('Uploads');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const isImage = kind === 'image';

  // Turns the action's machine-readable error code into a sentence, in the
  // admin's language. The codes themselves stay untranslated.
  function errorMessageFor(code: string): string {
    switch (code) {
      case 'unauthorized':
        return t('errors.unauthorized');
      case 'unconfigured':
        return t('errors.unconfigured');
      case 'no_file':
        return t('errors.no_file');
      case 'invalid_type':
        return isImage
          ? t('errors.invalidTypeImage')
          : t('errors.invalidTypePdf');
      case 'too_large':
        return isImage
          ? t('errors.tooLargeImage', { max: MAX_MB.image })
          : t('errors.tooLargePdf', { max: MAX_MB.datasheet });
      default:
        return t('errors.uploadFailed');
    }
  }

  function clientRejection(file: File): string | null {
    if (isImage) {
      if (!IMAGE_MIME_TYPES.includes(file.type)) {
        return t('errors.invalidTypeImage');
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return t('errors.tooLargeImage', { max: MAX_MB.image });
      }
    } else {
      if (file.type !== PDF_MIME_TYPE) {
        return t('errors.invalidTypePdf');
      }
      if (file.size > MAX_PDF_BYTES) {
        return t('errors.tooLargePdf', { max: MAX_MB.datasheet });
      }
    }
    return null;
  }

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploadError(null);

    const rejection = clientRejection(file);
    if (rejection) {
      setUploadError(rejection);
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.set('file', file);
      const result = isImage
        ? await uploadImage(formData)
        : await uploadDatasheet(formData);
      if (result.ok) {
        onUploaded(result.url);
        setShowUrlInput(false);
      } else {
        setUploadError(errorMessageFor(result.error));
      }
    } catch {
      setUploadError(t('failed'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <input
          ref={fileInputRef}
          id={id}
          type="file"
          accept={ACCEPT_BY_KIND[kind]}
          onChange={handleFileChange}
          disabled={uploading}
          className="hidden"
        />
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={uploading}
          onClick={() => fileInputRef.current?.click()}
        >
          {uploading
            ? t('uploading')
            : isImage
              ? t('uploadImage')
              : t('uploadPdf')}
        </Button>
        <button
          type="button"
          onClick={() => setShowUrlInput((shown) => !shown)}
          className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          {showUrlInput ? t('hideUrl') : t('pasteUrl')}
        </button>
      </div>

      {value ? (
        isImage ? (
          // Plain <img> on purpose: this previews a stored URL, and pasted
          // URLs can point anywhere, so next/image's fixed remotePatterns
          // config can't cover them.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={value}
            alt={t('currentImage')}
            className="h-24 w-40 rounded-lg border border-stone-200 bg-stone-50 object-contain"
          />
        ) : (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-brand-700 underline underline-offset-2"
          >
            {t('viewDatasheet')}
          </a>
        )
      ) : null}

      {uploadError ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {uploadError}
        </p>
      ) : null}

      {showUrlInput ? (
        <input
          id={`${id}-url`}
          type="text"
          autoComplete="off"
          placeholder={isImage ? 'https://…' : 'https://….pdf'}
          className={inputClasses}
          {...urlInputProps}
        />
      ) : null}
    </div>
  );
}
