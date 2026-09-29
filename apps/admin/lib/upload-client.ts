// Client side of the upload path, shared by every admin control that uploads
// (`components/upload-field.tsx` and `components/gallery-add-tile.tsx`).
//
// The rules themselves live in `lib/upload-rules.ts` and are enforced again,
// server side, in `lib/actions/uploads.ts` — the Server Action is the source
// of truth. This module only exists so the two client entry points cannot
// drift on the pre-check or on how an action's error code becomes a
// sentence: the accepted MIME types and the size ceiling are the
// security-relevant part, and they are read from the one shared constant
// module rather than restated per control.

import type { useTranslations } from 'next-intl';
import { uploadDatasheet, uploadImage } from './actions/uploads';
import {
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  PDF_MIME_TYPE,
  type UploadKind,
} from './upload-rules';

// Display limits, derived from the byte constants the action enforces, so the
// message can never disagree with the rule.
export const MAX_MB = {
  image: MAX_IMAGE_BYTES / (1024 * 1024),
  datasheet: MAX_PDF_BYTES / (1024 * 1024),
} as const;

// The `Uploads` translator, derived from next-intl itself (the same trick
// `lib/actions/validation-messages.ts` uses on the server) so the message
// keys stay type-checked against the `Uploads` namespace and this module does
// not have to restate the key list.
type UploadsTranslator = ReturnType<typeof useTranslations<'Uploads'>>;

export type UploadOutcome =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** Turns a Server Action's machine-readable error code into a sentence, in
 *  the admin's language. The codes themselves stay untranslated. */
export function uploadErrorMessage(
  t: UploadsTranslator,
  kind: UploadKind,
  code: string
): string {
  switch (code) {
    case 'unauthorized':
      return t('errors.unauthorized');
    case 'unconfigured':
      return t('errors.unconfigured');
    case 'no_file':
      return t('errors.no_file');
    case 'invalid_type':
      return kind === 'image'
        ? t('errors.invalidTypeImage')
        : t('errors.invalidTypePdf');
    case 'too_large':
      return kind === 'image'
        ? t('errors.tooLargeImage', { max: MAX_MB.image })
        : t('errors.tooLargePdf', { max: MAX_MB.datasheet });
    default:
      return t('errors.uploadFailed');
  }
}

/** Rejects a file before it is sent anywhere, or returns null to let it
 *  through. Mirrors the Server Action's checks for immediate feedback; the
 *  action re-validates regardless. */
export function clientRejection(
  t: UploadsTranslator,
  kind: UploadKind,
  file: File
): string | null {
  if (kind === 'image') {
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

/** Runs the upload for a kind and normalises both outcomes. */
export async function uploadFile(
  file: File,
  kind: UploadKind
): Promise<UploadOutcome> {
  const formData = new FormData();
  formData.set('file', file);
  const result =
    kind === 'image'
      ? await uploadImage(formData)
      : await uploadDatasheet(formData);
  if (result.ok) {
    return { ok: true, url: result.url };
  }
  return { ok: false, error: result.error };
}
