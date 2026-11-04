'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { maintenanceCategoryMessages } from './validation-messages';
import { revalidateWebPaths } from '../revalidate-web';
import { maintenanceCategoryInputSchema } from '../schemas';
import {
  MAINTENANCE_CATEGORY_AUDIT_SPEC,
  buildChanges,
  buildSnapshot,
} from '../audit-changes';

// The before-row is loaded with the same explicit allowlist the diff helper
// reads, inside the write transaction.
const MAINTENANCE_CATEGORY_AUDIT_SELECT = {
  nameEn: true,
  nameAr: true,
  slug: true,
  descriptionEn: true,
  descriptionAr: true,
  imageUrl: true,
  sortOrder: true,
} as const;

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('MaintenanceCategories');
  return maintenanceCategoryInputSchema(
    maintenanceCategoryMessages(t)
  ).safeParse(input);
}

// Prisma optional text columns accept undefined (skip); an empty form string
// means "cleared", which is stored as NULL rather than "".
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() === '' ? null : value;
}

export async function createMaintenanceCategory(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requireAdmin();
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
      const row = await tx.maintenanceCategory.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          descriptionAr: emptyToNull(parsed.data.descriptionAr) ?? null,
          descriptionEn: emptyToNull(parsed.data.descriptionEn) ?? null,
          imageUrl: parsed.data.imageUrl || null,
          sortOrder: parsed.data.sortOrder,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_CATEGORY_CREATE',
          entity: `MaintenanceCategory:${row.slug}`,
          details: buildSnapshot(row, MAINTENANCE_CATEGORY_AUDIT_SPEC),
        },
      });
      return row;
    });

    // Affected public pages: home showcase + the future maintenance listing
    // and this line's detail page (both locales).
    revalidateWebPaths(['/', '/maintenance', `/maintenance/${created.slug}`]);
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
    console.error('[admin] createMaintenanceCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateMaintenanceCategory(
  id: string,
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requireAdmin();
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
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.maintenanceCategory.findUnique({
        where: { id },
        select: MAINTENANCE_CATEGORY_AUDIT_SELECT,
      });
      if (!existing) {
        return null;
      }
      const row = await tx.maintenanceCategory.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          descriptionAr: emptyToNull(parsed.data.descriptionAr) ?? null,
          descriptionEn: emptyToNull(parsed.data.descriptionEn) ?? null,
          imageUrl: parsed.data.imageUrl || null,
          sortOrder: parsed.data.sortOrder,
        },
        select: MAINTENANCE_CATEGORY_AUDIT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_CATEGORY_UPDATE',
          entity: `MaintenanceCategory:${row.slug}`,
          details: buildChanges(existing, row, MAINTENANCE_CATEGORY_AUDIT_SPEC),
        },
      });
      return { row, previousSlug: existing.slug };
    });
    if (updated === null) {
      return { ok: false, error: 'not_found' };
    }

    // Both the old and the new detail path when the slug changed.
    const { row: updatedRow, previousSlug } = updated;
    const detailPaths =
      previousSlug === updatedRow.slug
        ? [`/maintenance/${updatedRow.slug}`]
        : [`/maintenance/${previousSlug}`, `/maintenance/${updatedRow.slug}`];
    revalidateWebPaths(['/', '/maintenance', ...detailPaths]);
    return { ok: true, slug: updatedRow.slug };
  } catch (error) {
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002'
    ) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] updateMaintenanceCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteMaintenanceCategory(
  id: string
): Promise<ActionResult<{ itemCount?: number }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const existing = await prisma.maintenanceCategory.findUnique({
    where: { id },
    include: { _count: { select: { items: true } } },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  // Explicit block first (friendly message with the count)...
  if (existing._count.items > 0) {
    return {
      ok: false,
      error: 'has_items',
      itemCount: existing._count.items,
    };
  }

  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.maintenanceCategory.findUnique({
        where: { id },
        select: MAINTENANCE_CATEGORY_AUDIT_SELECT,
      });
      if (!existing) {
        return null;
      }
      await tx.maintenanceCategory.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_CATEGORY_DELETE',
          entity: `MaintenanceCategory:${existing.slug}`,
          details: buildSnapshot(
            existing,
            MAINTENANCE_CATEGORY_AUDIT_SPEC,
            'delete'
          ),
        },
      });
      return existing;
    });
    if (deleted === null) {
      return { ok: false, error: 'not_found' };
    }

    revalidateWebPaths(['/', '/maintenance', `/maintenance/${deleted.slug}`]);
    return { ok: true };
  } catch (error) {
    // ...with the schema's onDelete: Restrict as the race-proof backstop:
    // an item created between the check and the delete lands here.
    if (
      typeof error === 'object' &&
      error !== null &&
      'code' in error &&
      (error as { code?: string }).code === 'P2003'
    ) {
      return { ok: false, error: 'has_items' };
    }
    console.error('[admin] deleteMaintenanceCategory failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
