'use server';

import { prisma } from '@colina/db';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { serviceInputSchema } from '../schemas';

// Generic English messages for the action contract (see Phase 10
// categories.ts for the convention).
const SERVER_MESSAGES = {
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  titleAr: 'Arabic title must be at least 2 characters.',
  titleEn: 'English title must be at least 2 characters.',
  descriptionAr: 'Arabic description must be at least 10 characters.',
  descriptionEn: 'English description must be at least 10 characters.',
  scopeAr: 'Arabic scope must be at least 10 characters.',
  scopeEn: 'English scope must be at least 10 characters.',
  icon: 'Icon must not be empty.',
};

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

  const parsed = serviceInputSchema(SERVER_MESSAGES).safeParse(input);
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

  const parsed = serviceInputSchema(SERVER_MESSAGES).safeParse(input);
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
    const existing = await prisma.maintenanceService.findUnique({
      where: { id },
    });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.maintenanceService.update({
        where: { id },
        data: { ...parsed.data },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SERVICE_UPDATE',
          entity: `MaintenanceService:${row.slug}`,
        },
      });
      return row;
    });

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
  const existing = await prisma.maintenanceService.findUnique({
    where: { id },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.maintenanceService.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SERVICE_DELETE',
          entity: `MaintenanceService:${existing.slug}`,
        },
      });
    });

    revalidateWebPaths(['/services']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteService failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
