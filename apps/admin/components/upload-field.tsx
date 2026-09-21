'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import type { UseFormRegisterReturn } from 'react-hook-form';
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

function errorMessageFor(code: string, kind: UploadKind): string {
  switch (code) {
    case 'unauthorized':
      return 'Your session expired. Log in again.';
    case 'unconfigured':
      return 'Uploads are not configured yet. Add CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET to the environment.';
    case 'no_file':
      return 'Choose a file to upload.';
    case 'invalid_type':
      return kind === 'image'
        ? 'Only JPG, PNG or WEBP images are allowed.'
        : 'Only PDF files are allowed.';
    case 'too_large':
      return kind === 'image'
        ? 'Images must be 5 MB or smaller.'
        : 'PDFs must be 15 MB or smaller.';
    default:
      return 'Upload failed. Try again.';
  }
}

export function UploadField({
  id,
  kind,
  value,
  onUploaded,
  urlInputProps,
}: UploadFieldProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);

  const isImage = kind === 'image';

  function clientRejection(file: File): string | null {
    if (isImage) {
      if (!IMAGE_MIME_TYPES.includes(file.type)) {
        return 'Only JPG, PNG or WEBP images are allowed.';
      }
      if (file.size > MAX_IMAGE_BYTES) {
        return 'Images must be 5 MB or smaller.';
      }
    } else {
      if (file.type !== PDF_MIME_TYPE) {
        return 'Only PDF files are allowed.';
      }
      if (file.size > MAX_PDF_BYTES) {
        return 'PDFs must be 15 MB or smaller.';
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
        setUploadError(errorMessageFor(result.error, kind));
      }
    } catch {
      setUploadError('Upload failed. Try again.');
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
          {uploading ? 'Uploading…' : isImage ? 'Upload image' : 'Upload PDF'}
        </Button>
        <button
          type="button"
          onClick={() => setShowUrlInput((shown) => !shown)}
          className="text-sm text-brand-700 underline underline-offset-2 hover:text-brand-800"
        >
          {showUrlInput ? 'Hide URL field' : 'Or paste a URL'}
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
            alt="Current image"
            className="h-24 w-40 rounded-lg border border-stone-200 bg-stone-50 object-contain"
          />
        ) : (
          <a
            href={value}
            target="_blank"
            rel="noreferrer"
            className="w-fit text-sm text-brand-700 underline underline-offset-2"
          >
            View uploaded datasheet
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
