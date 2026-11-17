'use server';

import { prisma } from '@colina/db';
import type { AdminSession } from '../admin-action';
import type { ActionResult } from '../admin-action';
import {
  canModifyEntity,
  requirePermission,
  type Capability,
} from '../permissions';
import { auditActor } from '../audit-actor';
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
  type UploadTarget,
} from '../upload-rules';

// Cloudinary upload Server Actions for the admin panel. Each action:
//   - parses the target context the form sent (machine, category or other),
//   - requires the matching capability: `uploads:machine-media` for the two
//     entity kinds an editor owns, `uploads:other` for every other form,
//   - for an existing machine/category target, loads the row and applies the
//     same ownership rule as edit/delete (a guessed id is refused),
//   - rejects missing Cloudinary configuration with a distinct error the
//     UI renders as "uploads are not configured" (never a silent crash),
//   - validates MIME type, extension and size BEFORE anything is sent to
//     Cloudinary (agent.md: restrict by MIME type, extension and size,
//     never trust a client-supplied filename — only the extension is read
//     from it, and only to cross-check the declared MIME type),
//   - writes an AuditLog row for every asset it creates, immediately after
//     Cloudinary accepts it (the asset lives outside Postgres, so the two
//     writes cannot share a transaction; a failed audit row fails the
//     action and the URL is never handed to the form),
//   - returns the delivered `secure_url`, which the form stores verbatim
//     into the existing absolute-URL columns (schema unchanged).
//
// Size/type rules mirror the client-side pre-checks in upload-field.tsx;
// the server is the source of truth.

// Images are stored at most 2400 px on the longest side with automatic
// quality, so a modern camera upload cannot sit in Cloudinary at full
// resolution. `c_limit` scales down only and never upscales; giving BOTH
// axes the same bound is what caps the LONGEST side rather than just the
// width. Datasheets (raw PDFs) are never transformed.
const IMAGE_INCOMING_TRANSFORMATION = 'c_limit,w_2400,h_2400,q_auto';

// Error codes the UI maps to messages, documented here as the contract:
//   unauthorized   — no valid admin session, or no upload capability
//   forbidden      — the target exists but belongs to another owner
//   invalid_target — the form did not send a recognised target context
//   unconfigured   — CLOUDINARY_* env vars missing (rendered as a clear
//                    "uploads are not configured" message, never a crash)
//   no_file        — FormData carried no File under the `file` key
//   invalid_type   — MIME type / extension not allowed for this kind
//   too_large      — file exceeds the kind's max size
//   upload_failed  — Cloudinary rejected the upload (or returned no URL)
//   server_error   — the asset was stored but its audit row could not be
//                    written; the URL is withheld so no unlogged asset can be
//                    persisted (the orphaned asset is left for media cleanup)

const TARGET_KINDS = ['machine', 'category', 'other'] as const;
type TargetKind = (typeof TARGET_KINDS)[number];

function parseTarget(formData: FormData): UploadTarget | null {
  const kindValue = formData.get('target');
  if (typeof kindValue !== 'string') {
    return null;
  }
  const kind = TARGET_KINDS.includes(kindValue as TargetKind)
    ? (kindValue as TargetKind)
    : null;
  if (!kind) {
    return null;
  }
  if (kind === 'other') {
    return { kind };
  }

  const idValue = formData.get('targetId');
  if (idValue === null || idValue === '') {
    return { kind };
  }
  if (typeof idValue !== 'string' || idValue.length > 64) {
    return null;
  }
  return { kind, id: idValue };
}

function capabilityFor(target: UploadTarget): Capability {
  return target.kind === 'other' ? 'uploads:other' : 'uploads:machine-media';
}

/** The ownership half of the upload guard. Capability is checked before this. */
async function targetBelongsToSession(
  session: AdminSession,
  target: UploadTarget
): Promise<boolean> {
  if (session.user.role === 'SUPER_ADMIN') {
    return true;
  }
  // The editor's capability is only machine/category media, and a create form
  // has no row to own yet.
  if (target.kind === 'other') {
    return false;
  }
  if (!target.id) {
    return true;
  }

  const row =
    target.kind === 'machine'
      ? await prisma.machine.findUnique({
          where: { id: target.id },
          select: { createdById: true },
        })
      : await prisma.machineCategory.findUnique({
          where: { id: target.id },
          select: { createdById: true },
        });

  return row !== null && canModifyEntity(session, row);
}

export async function uploadImage(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const target = parseTarget(formData);
  if (!target) {
    return { ok: false, error: 'invalid_target' };
  }
  const session = await requirePermission(capabilityFor(target));
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!(await targetBelongsToSession(session, target))) {
    return { ok: false, error: 'forbidden' };
  }
  return uploadFile(formData, 'image', session);
}

export async function uploadDatasheet(
  formData: FormData
): Promise<ActionResult<{ url: string }>> {
  const target = parseTarget(formData);
  if (!target) {
    return { ok: false, error: 'invalid_target' };
  }
  const session = await requirePermission(capabilityFor(target));
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  if (!(await targetBelongsToSession(session, target))) {
    return { ok: false, error: 'forbidden' };
  }
  return uploadFile(formData, 'datasheet', session);
}

async function uploadFile(
  formData: FormData,
  kind: 'image' | 'datasheet',
  session: AdminSession
): Promise<ActionResult<{ url: string }>> {
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
    const { secureUrl, publicId } = await uploadBuffer(buffer, {
      resourceType,
      folder,
      ...(kind === 'image'
        ? { incomingTransformation: IMAGE_INCOMING_TRANSFORMATION }
        : {}),
    });

    // Fail closed: the form only receives a URL after the audit row lands,
    // so every asset that can be persisted from the UI is accounted for.
    try {
      await prisma.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'UPLOAD_CREATE',
          entity: `Cloudinary:${resourceType}:${publicId}`,
          details: {
            kind,
            mimeType: file.type,
            bytes: file.size,
            // Uploads have no entity row to label them; the Cloudinary
            // public id is the stable, non-secret name the admin recognises.
            label: { en: publicId, ar: publicId },
            search: publicId.toLowerCase(),
            changes: [],
          },
        },
      });
    } catch (error) {
      console.error('[admin] upload audit failed:', error);
      return { ok: false, error: 'server_error' };
    }

    return { ok: true, url: secureUrl };
  } catch (error) {
    console.error('[admin] Cloudinary upload failed:', error);
    return { ok: false, error: 'upload_failed' };
  }
}
