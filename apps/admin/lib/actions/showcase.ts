'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { showcaseMessages } from './validation-messages';
import { showcaseInputSchema } from '../schemas';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('MaintenanceShowcase');
  return showcaseInputSchema(showcaseMessages(t)).safeParse(input);
}

// Prisma optional text columns accept undefined (skip) — empty form
// strings normalize to null so "cleared" reads as cleared, not "".
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() === '' ? null : value;
}

export async function createShowcase(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
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
      const row = await tx.maintenanceShowcase.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          categoryId: parsed.data.categoryId,
          descriptionAr: emptyToNull(parsed.data.descriptionAr) ?? null,
          descriptionEn: emptyToNull(parsed.data.descriptionEn) ?? null,
          // Both photos are required by the schema, so neither is normalised
          // to null here: an empty one is a validation failure, not a value.
          beforeImageUrl: parsed.data.beforeImageUrl,
          afterImageUrl: parsed.data.afterImageUrl,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_SHOWCASE_CREATE',
          entity: `MaintenanceShowcase:${row.id}`,
        },
      });
      return row;
    });

    // Affected public pages: the home page section and the future maintenance
    // listing that groups these rows by production line.
    revalidateWebPaths(['/', '/maintenance']);
    return { ok: true, id: created.id };
  } catch (error) {
    console.error('[admin] createShowcase failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateShowcase(
  id: string,
  input: unknown
): Promise<ActionResult> {
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
    const existing = await prisma.maintenanceShowcase.findUnique({
      where: { id },
    });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.maintenanceShowcase.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          categoryId: parsed.data.categoryId,
          descriptionAr: emptyToNull(parsed.data.descriptionAr),
          descriptionEn: emptyToNull(parsed.data.descriptionEn),
          beforeImageUrl: parsed.data.beforeImageUrl,
          afterImageUrl: parsed.data.afterImageUrl,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_SHOWCASE_UPDATE',
          entity: `MaintenanceShowcase:${id}`,
        },
      });
    });

    revalidateWebPaths(['/', '/maintenance']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updateShowcase failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteShowcase(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at MaintenanceShowcase: nothing to block on, straight delete.
  const existing = await prisma.maintenanceShowcase.findUnique({
    where: { id },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenanceShowcase.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MAINTENANCE_SHOWCASE_DELETE',
          entity: `MaintenanceShowcase:${id}`,
        },
      });
    });

    revalidateWebPaths(['/', '/maintenance']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteShowcase failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
