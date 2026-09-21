// Shared upload validation rules, used by BOTH the client component
// (instant feedback in upload-field.tsx) and the Server Actions in
// lib/actions/uploads.ts (the actual source of truth). Kept in a plain
// module so client and server code can import the same constants.
//
// Rules (agent.md: restrict by MIME type, extension and max size):
//   images:     jpg/png/webp only, max 5 MB
//   datasheets: pdf only,           max 15 MB

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_PDF_BYTES = 15 * 1024 * 1024;

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const PDF_MIME_TYPE = 'application/pdf';

export const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp'];
export const PDF_EXTENSION = 'pdf';

export type UploadKind = 'image' | 'datasheet';

export const ACCEPT_BY_KIND: Record<UploadKind, string> = {
  image: 'image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp',
  datasheet: 'application/pdf,.pdf',
};
