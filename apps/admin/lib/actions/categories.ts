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

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('Categories');
  return categoryInputSchema(categoryMessages(t)).safeParse(input);
}

export async function createCategory(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requirePermission('categories:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = await parse(input);
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

  const parsed = await parse(input);
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
    const result = await prisma.$transaction(async (tx) => {
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
        },
      });
      if (!existing) {
        return null;
      }
      // Guessed ids behave like missing rows (see machines.ts).
      if (!canModifyEntity(session, existing)) {
        return null;
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
        },
        select: {
          nameAr: true,
          nameEn: true,
          slug: true,
          descriptionAr: true,
          descriptionEn: true,
          image: true,
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
      return { row, previousSlug: existing.slug };
    });
    if (result === null) {
      return { ok: false, error: 'not_found' };
    }

    // Affected public pages: home grid + listing + this category's detail
    // (both locales; old slug too when the slug itself changed).
    const { row: updated, previousSlug } = result;
    const detailPaths =
      previousSlug === updated.slug
        ? [`/categories/${updated.slug}`]
        : [`/categories/${previousSlug}`, `/categories/${updated.slug}`];
    revalidateWebPaths(['/', '/categories', ...detailPaths]);
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
