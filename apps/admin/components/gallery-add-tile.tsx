'use client';

import { useRef, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { Icon } from './icons';
import { ACCEPT_BY_KIND } from '@/lib/upload-rules';
import {
  MAX_MB,
  clientRejection,
  uploadErrorMessage,
  uploadFile,
} from '@/lib/upload-client';

// The gallery's "add" affordance: one action instead of two.
//
// It used to be a button that appended an empty row, which then had to be
// filled in by pressing "Upload image" inside it — so adding a picture was
// two clicks plus a dead row if the admin forgot. This tile opens the file
// picker itself, uploads the chosen file, and only then hands the resulting
// URL to `onAdded`, so a row never exists without an image in it.
//
// Nothing is appended when the picker is dismissed or the upload fails; the
// error is reported here and the gallery is left exactly as it was.

type GalleryAddTileProps = {
  /** Receives the uploaded URL. The caller appends the row. */
  onAdded: (url: string) => void;
};

export function GalleryAddTile({ onAdded }: GalleryAddTileProps) {
  const t = useTranslations('Uploads');
  const g = useTranslations('Machines.form');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so picking the same file twice in a row still fires onChange.
    event.target.value = '';
    if (!file) {
      return;
    }
    setError(null);

    const rejection = clientRejection(t, 'image', file);
    if (rejection) {
      setError(rejection);
      return;
    }

    setUploading(true);
    try {
      const result = await uploadFile(file, 'image');
      if (result.ok) {
        onAdded(result.url);
      } else {
        setError(uploadErrorMessage(t, 'image', result.error));
      }
    } catch {
      setError(t('failed'));
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="mt-3">
      <input
        ref={fileInputRef}
        id="machine-gallery-add"
        type="file"
        accept={ACCEPT_BY_KIND.image}
        onChange={handleFileChange}
        disabled={uploading}
        className="hidden"
      />
      <Button
        type="button"
        variant="secondary"
        onClick={() => fileInputRef.current?.click()}
        disabled={uploading}
        // Dashed border and full width so it reads as a tile / drop target
        // rather than as another action in the form, and the whole row is the
        // click target on a phone. `w-full` is a different property from the
        // Button's own `inline-flex`/`items-center`/`justify-center`, so this
        // composes instead of overriding them.
        className="w-full justify-start border-dashed"
      >
        <span className="flex items-center gap-2">
          {uploading ? (
            <Icon name="spinner" className="h-4 w-4 animate-spin" />
          ) : (
            <Icon name="plus" className="h-4 w-4" />
          )}
          {uploading ? t('uploading') : g('addImage')}
        </span>
      </Button>
      {/* Kept out of the button so it does not become part of its accessible
          name, which would read as one run-on label. */}
      <p className="mt-1 text-xs text-stone-500">
        {g('addImageHint', { max: MAX_MB.image })}
      </p>
      {error ? (
        <p role="alert" className="mt-1 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
