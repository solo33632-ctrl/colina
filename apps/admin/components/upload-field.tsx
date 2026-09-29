'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { inputClasses } from './form-fields';
import { ACCEPT_BY_KIND, type UploadKind } from '@/lib/upload-rules';
import {
  clientRejection,
  uploadErrorMessage,
  uploadFile,
} from '@/lib/upload-client';

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
  /** Clears the field back to empty. It does not delete anything remotely:
   *  the project stores only the URL, so the file itself is out of scope. */
  onClear?: () => void;
  urlInputProps: UseFormRegisterReturn;
  /**
   * Per-instance accessible names. A list that renders one of these per row
   * needs each control to say which row it belongs to, otherwise every
   * "Remove" in the list is indistinguishable to a screen reader. Each name is
   * expected to contain its own visible label, so the control still reads
   * correctly when the visible text is all that is seen.
   */
  uploadAriaLabel?: string;
  pasteUrlAriaLabel?: string;
  clearAriaLabel?: string;
};

export function UploadField({
  id,
  kind,
  value,
  onUploaded,
  onClear,
  urlInputProps,
  uploadAriaLabel,
  pasteUrlAriaLabel,
  clearAriaLabel,
}: UploadFieldProps) {
  const t = useTranslations('Uploads');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const isImage = kind === 'image';
  const uploadText = isImage ? t('uploadImage') : t('uploadPdf');

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }
    setUploadError(null);

    const rejection = clientRejection(t, kind, file);
    if (rejection) {
      setUploadError(rejection);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadFile(file, kind);
      if (result.ok) {
        onUploaded(result.url);
        setShowUrlInput(false);
      } else {
        setUploadError(uploadErrorMessage(t, kind, result.error));
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
          aria-label={uploadAriaLabel}
        >
          {uploading ? t('uploading') : uploadText}
        </Button>
        <button
          type="button"
          onClick={() => setShowUrlInput((shown) => !shown)}
          aria-label={pasteUrlAriaLabel}
          className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          {showUrlInput ? t('hideUrl') : t('pasteUrl')}
        </button>
      </div>

      {value ? (
        <div className="flex flex-wrap items-center gap-3">
          {isImage ? (
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
          )}
          {onClear ? (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={onClear}
              aria-label={clearAriaLabel}
            >
              {t('removeFile')}
            </Button>
          ) : null}
        </div>
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
