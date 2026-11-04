'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { serviceMessages } from './validation-messages';
import { serviceInputSchema } from '../schemas';
import {
  MAINTENANCE_SERVICE_AUDIT_SPEC,
  buildChanges,
  buildSnapshot,
} from '../audit-changes';

const SERVICE_AUDIT_SELECT = {
  titleEn: true,
  titleAr: true,
  slug: true,
  descriptionEn: true,
  descriptionAr: true,
  scopeEn: true,
  scopeAr: true,
  icon: true,
} as const;

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('Services');
  return serviceInputSchema(serviceMessages(t)).safeParse(input);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function createService(
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
      const row = await tx.maintenanceService.create({
        data: { ...parsed.data },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SERVICE_CREATE',
          entity: `MaintenanceService:${row.slug}`,
          details: buildSnapshot(row, MAINTENANCE_SERVICE_AUDIT_SPEC),
        },
      });
      return row;
    });

    // Affected public pages: services listing (both locales).
    revalidateWebPaths(['/services']);
    return { ok: true, slug: created.slug };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] createService failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateService(
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
      const existing = await tx.maintenanceService.findUnique({
        where: { id },
        select: SERVICE_AUDIT_SELECT,
      });
      if (!existing) {
        return null;
      }
      const row = await tx.maintenanceService.update({
        where: { id },
        data: { ...parsed.data },
        select: SERVICE_AUDIT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SERVICE_UPDATE',
          entity: `MaintenanceService:${row.slug}`,
          details: buildChanges(existing, row, MAINTENANCE_SERVICE_AUDIT_SPEC),
        },
      });
      return row;
    });
    if (updated === null) {
      return { ok: false, error: 'not_found' };
    }

    revalidateWebPaths(['/services']);
    return { ok: true, slug: updated.slug };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] updateService failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteService(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at MaintenanceService: nothing to block on.
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.maintenanceService.findUnique({
        where: { id },
        select: SERVICE_AUDIT_SELECT,
      });
      if (!existing) {
        return null;
      }
      await tx.maintenanceService.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SERVICE_DELETE',
          entity: `MaintenanceService:${existing.slug}`,
          details: buildSnapshot(
            existing,
            MAINTENANCE_SERVICE_AUDIT_SPEC,
            'delete'
          ),
        },
      });
      return existing;
    });
    if (deleted === null) {
      return { ok: false, error: 'not_found' };
    }

    revalidateWebPaths(['/services']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteService failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
