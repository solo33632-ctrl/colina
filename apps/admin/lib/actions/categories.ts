'use server';

import { prisma } from '@colina/db';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { categoryInputSchema } from '../schemas';

// Generic English messages for the action contract. The client maps
// field issues back onto its translated form; `error` codes are matched
// programmatically, never displayed verbatim.
const SERVER_MESSAGES = {
  nameAr: 'Arabic name must be at least 2 characters.',
  nameEn: 'English name must be at least 2 characters.',
  slug: 'Slug must be at least 2 lowercase letters, numbers or dashes.',
  descriptionAr: 'Arabic description must be at least 10 characters.',
  descriptionEn: 'English description must be at least 10 characters.',
  image: 'Image must be an absolute http(s) URL or empty.',
};

export async function createCategory(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = categoryInputSchema(SERVER_MESSAGES).safeParse(input);
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
          descriptionAr: parsed.data.descriptionAr,
          descriptionEn: parsed.data.descriptionEn,
          image: parsed.data.image || null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'CATEGORY_CREATE',
          entity: `MachineCategory:${row.slug}`,
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
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = categoryInputSchema(SERVER_MESSAGES).safeParse(input);
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
    const existing = await prisma.machineCategory.findUnique({
      where: { id },
    });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.machineCategory.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          descriptionAr: parsed.data.descriptionAr,
          descriptionEn: parsed.data.descriptionEn,
          image: parsed.data.image || null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'CATEGORY_UPDATE',
          entity: `MachineCategory:${row.slug}`,
        },
      });
      return row;
    });

    // Affected public pages: home grid + listing + this category's detail
    // (both locales; old slug too when the slug itself changed).
    const detailPaths =
      existing.slug === updated.slug
        ? [`/categories/${updated.slug}`]
        : [`/categories/${existing.slug}`, `/categories/${updated.slug}`];
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
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const existing = await prisma.machineCategory.findUnique({
    where: { id },
    include: { _count: { select: { machines: true } } },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  // Explicit block first (friendly message with the count)...
  if (existing._count.machines > 0) {
    return {
      ok: false,
      error: 'has_machines',
      machineCount: existing._count.machines,
    };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.machineCategory.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'CATEGORY_DELETE',
          entity: `MachineCategory:${existing.slug}`,
        },
      });
    });

    revalidateWebPaths(['/', '/categories', `/categories/${existing.slug}`]);
    return { ok: true };
  } catch (error) {
    // ...with the schema's onDelete: Restrict as the race-proof backstop:
    // a machine created between the check and the delete lands here.
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
