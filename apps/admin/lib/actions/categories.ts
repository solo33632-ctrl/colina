'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import type { ActionResult } from '../admin-action';
import { canModifyEntity, requirePermission } from '../permissions';
import {
  buildChanges,
  buildSnapshot,
  CATEGORY_AUDIT_SPEC,
} from '../audit-changes';
import { auditActor } from '../audit-actor';
import { deleteCategoryInTransaction } from '../entity-delete';
import { categoryMessages } from './validation-messages';
import { revalidateWebPaths } from '../revalidate-web';
import { categoryInputSchema } from '../schemas';
import { mediaFieldIssues } from '../media-url';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('Categories');
  const messages = categoryMessages(t);
  return { parsed: categoryInputSchema(messages).safeParse(input), messages };
}

export async function createCategory(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requirePermission('categories:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const { parsed, messages } = await parse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'validation_failed',
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  // Stage 4c: no stored value exists on create, so any supplied cover image
  // must already be a Cloudinary URL on the configured cloud.
  const mediaIssues = mediaFieldIssues([
    {
      field: 'image',
      value: parsed.data.image,
      optional: true,
      message: messages.image,
    },
  ]);
  if (mediaIssues.length > 0) {
    return { ok: false, error: 'validation_failed', issues: mediaIssues };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.machineCategory.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          createdById: session.user.id,
          descriptionAr: parsed.data.descriptionAr ?? '',
          descriptionEn: parsed.data.descriptionEn ?? '',
          image: parsed.data.image || null,
          // Stage 4e: an editor's new category is always a draft; a full
          // admin keeps the form's switch (default publish).
          isPublished:
            session.user.role === 'EDITOR'
              ? false
              : (parsed.data.isPublished ?? true),
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'CATEGORY_CREATE',
          entity: `MachineCategory:${row.slug}`,
          details: buildSnapshot(row, CATEGORY_AUDIT_SPEC),
        },
      });
      return row;
    });

    // Affected public pages: home grid + listing (both locales).
    revalidateWebPaths(['/', '/categories']);
    return { ok: true, slug: created.slug };
  } catch (error) {
    // Unique slug race (or any pre-check gap): same friendly code.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] createCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateCategory(
  id: string,
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requirePermission('categories:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const { parsed, messages } = await parse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'validation_failed',
      issues: parsed.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      })),
    };
  }

  try {
    const outcome = await prisma.$transaction(async (tx) => {
      // Before-row with the allowlisted fields only, read in the write's
      // transaction so the diff is consistent with what gets stored.
      const existing = await tx.machineCategory.findUnique({
        where: { id },
        select: {
          createdById: true,
          nameAr: true,
          nameEn: true,
          slug: true,
          descriptionAr: true,
          descriptionEn: true,
          image: true,
          isPublished: true,
          // Stage 4e: a category becoming a draft hides every machine detail
          // page in it, so those cached paths are purged too.
          machines: { select: { slug: true } },
        },
      });
      if (!existing) {
        return { status: 'not_found' as const };
      }
      // Guessed ids behave like missing rows (see machines.ts).
      if (!canModifyEntity(session, existing)) {
        return { status: 'not_found' as const };
      }

      // Stage 4c: an exact stored value is grandfathered; anything new or
      // changed must be a Cloudinary URL on the configured cloud.
      const mediaIssues = mediaFieldIssues([
        {
          field: 'image',
          value: parsed.data.image,
          optional: true,
          message: messages.image,
          unchanged: existing.image,
        },
      ]);
      if (mediaIssues.length > 0) {
        return {
          status: 'validation_failed' as const,
          issues: mediaIssues,
        };
      }

      const row = await tx.machineCategory.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          descriptionAr: parsed.data.descriptionAr ?? '',
          descriptionEn: parsed.data.descriptionEn ?? '',
          image: parsed.data.image || null,
          // Stage 4e: an editor's save always lands in draft, even when the
          // stored row was published — the item goes back for review. A full
          // admin keeps whatever the form says, or the current value when the
          // field is omitted from a non-form call.
          isPublished:
            session.user.role === 'EDITOR'
              ? false
              : (parsed.data.isPublished ?? existing.isPublished),
        },
        select: {
          nameAr: true,
          nameEn: true,
          slug: true,
          descriptionAr: true,
          descriptionEn: true,
          image: true,
          isPublished: true,
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'CATEGORY_UPDATE',
          entity: `MachineCategory:${row.slug}`,
          details: buildChanges(existing, row, CATEGORY_AUDIT_SPEC),
        },
      });
      return {
        status: 'ok' as const,
        row,
        previousSlug: existing.slug,
        machineSlugs: existing.machines.map((machine) => machine.slug),
      };
    });
    if (outcome.status === 'not_found') {
      return { ok: false, error: 'not_found' };
    }
    if (outcome.status === 'validation_failed') {
      return {
        ok: false,
        error: 'validation_failed',
        issues: outcome.issues,
      };
    }

    // Affected public pages: home grid + listing + this category's detail
    // (both locales; old slug too when the slug itself changed), plus every
    // machine detail in the category because the category rule can hide or
    // reveal all of them at once.
    const { row: updated, previousSlug } = outcome;
    const detailPaths =
      previousSlug === updated.slug
        ? [`/categories/${updated.slug}`]
        : [`/categories/${previousSlug}`, `/categories/${updated.slug}`];
    revalidateWebPaths([
      '/',
      '/categories',
      ...detailPaths,
      ...outcome.machineSlugs.map((slug) => `/machines/${slug}`),
    ]);
    return { ok: true, slug: updated.slug };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] updateCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteCategory(
  id: string
): Promise<ActionResult<{ machineCount?: number }>> {
  const session = await requirePermission('categories:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  try {
    const deleted = await prisma.$transaction((tx) =>
      deleteCategoryInTransaction(tx, id, session)
    );
    if (!deleted.ok) {
      return deleted.error === 'has_machines'
        ? {
            ok: false,
            error: deleted.error,
            machineCount: deleted.machineCount,
          }
        : { ok: false, error: deleted.error };
    }

    revalidateWebPaths(['/', '/categories', `/categories/${deleted.slug}`]);
    return { ok: true };
  } catch (error) {
    // The schema's onDelete: Restrict is the race-proof backstop: a machine
    // created between the check and the delete lands here.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2003'
    ) {
      return { ok: false, error: 'has_machines' };
    }
    console.error('[admin] deleteCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
