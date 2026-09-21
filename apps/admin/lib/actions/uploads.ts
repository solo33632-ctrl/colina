'use server';

import { requireAdmin, type ActionResult } from '../admin-action';
import {
  cloudinaryCredentials,
  uploadBuffer,
  type CloudinaryResourceType,
} from '../cloudinary';
import {
  IMAGE_EXTENSIONS,
  IMAGE_MIME_TYPES,
  MAX_IMAGE_BYTES,
  MAX_PDF_BYTES,
  PDF_EXTENSION,
  PDF_MIME_TYPE,
} from '../upload-rules';

// Cloudinary upload Server Actions for the admin panel. Each action:
//   - requires an authenticated admin session (defense in depth),
//   - rejects missing Cloudinary configuration with a distinct error the
//     UI renders as "uploads are not configured" (never a silent crash),
//   - validates MIME type, extension and size BEFORE anything is sent to
//     Cloudinary (agent.md: restrict by MIME type, extension and size,
//     never trust a client-supplied filename — only the extension is read
//     from it, and only to cross-check the declared MIME type),
//   - returns the delivered `secure_url`, which the form stores verbatim
//     into the existing absolute-URL columns (schema unchanged).
//
// Size/type rules mirror the client-side pre-checks in upload-field.tsx;
// the server is the source of truth.

// Error codes the UI maps to messages, documented here as the contract:
//   unauthorized  — no valid admin session
//   unconfigured  — CLOUDINARY_* env vars missing (rendered as a clear
//                   "uploads are not configured" message, never a crash)
//   no_file       — FormData carried no File under the `file` key
//   invalid_type  — MIME type / extension not allowed for this kind
//   too_large     — file exceeds the kind's max size
//   upload_failed — Cloudinary rejected the upload (or returned no URL)
export async function uploadImage(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  return uploadFile(formData, 'image');
}

export async function uploadDatasheet(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  return uploadFile(formData, 'datasheet');
}

async function uploadFile(
  formData: FormData,
  kind: 'image' | 'datasheet'
): Promise<ActionResult<{ url: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  if (!cloudinaryCredentials()) {
    return { ok: false, error: 'unconfigured' };
  }

  const file = formData.get('file');
  if (!(file instanceof File)) {
    return { ok: false, error: 'no_file' };
  }

  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';
  if (kind === 'image') {
    if (
      !IMAGE_MIME_TYPES.includes(file.type) ||
      !IMAGE_EXTENSIONS.includes(extension)
    ) {
      return { ok: false, error: 'invalid_type' };
    }
    if (file.size > MAX_IMAGE_BYTES) {
      return { ok: false, error: 'too_large' };
    }
  } else {
    if (file.type !== PDF_MIME_TYPE || extension !== PDF_EXTENSION) {
      return { ok: false, error: 'invalid_type' };
    }
    if (file.size > MAX_PDF_BYTES) {
      return { ok: false, error: 'too_large' };
    }
  }

  const resourceType: CloudinaryResourceType =
    kind === 'image' ? 'image' : 'raw';
  const folder = kind === 'image' ? 'colina' : 'colina/datasheets';

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const { secureUrl } = await uploadBuffer(buffer, {
      resourceType,
      folder,
    });
    return { ok: true, url: secureUrl };
  } catch (error) {
    console.error('[admin] Cloudinary upload failed:', error);
    return { ok: false, error: 'upload_failed' };
  }
}
