'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { machineMessages } from './validation-messages';
import { revalidateWebPaths } from '../revalidate-web';
import { machineInputSchema } from '../schemas';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parseResult(input: unknown) {
  const t = await getTranslations('Machines');
  return machineInputSchema(machineMessages(t)).safeParse(input);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

export async function createMachine(
  input: unknown
): Promise<ActionResult<{ slug: string; categorySlug: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = await parseResult(input);
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

  // Self-links are impossible on create (no id yet); dedupe defensively.
  const relatedIds = [...new Set(parsed.data.relatedIds)];

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.machine.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          categoryId: parsed.data.categoryId,
          shortDescriptionAr: parsed.data.shortDescriptionAr,
          shortDescriptionEn: parsed.data.shortDescriptionEn,
          descriptionAr: parsed.data.descriptionAr,
          descriptionEn: parsed.data.descriptionEn,
          specsAr: parsed.data.specsAr,
          specsEn: parsed.data.specsEn,
          datasheetUrl: parsed.data.datasheetUrl || null,
          featured: parsed.data.featured,
          relatedMachines:
            relatedIds.length > 0
              ? { connect: relatedIds.map((id) => ({ id })) }
              : undefined,
        },
        include: { category: { select: { slug: true } } },
      });
      // Wholesale gallery sync (position order normalized on write).
      const ordered = [...parsed.data.images].sort(
        (a, b) => a.position - b.position
      );
      if (ordered.length > 0) {
        await tx.machineImage.createMany({
          data: ordered.map((image, index) => ({
            machineId: row.id,
            url: image.url,
            position: index,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MACHINE_CREATE',
          entity: `Machine:${row.slug}`,
        },
      });
      return row;
    });

    // Affected public pages: the parent category detail (machine grid), plus
    // the home page when the machine is featured, since the featured strip
    // reads this column. Revalidating '/' unconditionally keeps the call
    // independent of the flag's previous value, which a create never has.
    revalidateWebPaths(['/', `/categories/${created.category.slug}`]);
    return {
      ok: true,
      slug: created.slug,
      categorySlug: created.category.slug,
    };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] createMachine failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateMachine(
  id: string,
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = await parseResult(input);
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

  // Drop self-links and dupes: the relation is directional and a machine
  // must never point at itself.
  const relatedIds = [...new Set(parsed.data.relatedIds)].filter(
    (relatedId) => relatedId !== id
  );

  try {
    const existing = await prisma.machine.findUnique({
      where: { id },
      include: { category: { select: { slug: true } } },
    });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.machine.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          slug: parsed.data.slug,
          categoryId: parsed.data.categoryId,
          shortDescriptionAr: parsed.data.shortDescriptionAr,
          shortDescriptionEn: parsed.data.shortDescriptionEn,
          descriptionAr: parsed.data.descriptionAr,
          descriptionEn: parsed.data.descriptionEn,
          specsAr: parsed.data.specsAr,
          specsEn: parsed.data.specsEn,
          datasheetUrl: parsed.data.datasheetUrl || null,
          featured: parsed.data.featured,
          relatedMachines: {
            set: relatedIds.map((relatedId) => ({ id: relatedId })),
          },
        },
        include: { category: { select: { slug: true } } },
      });
      await tx.machineImage.deleteMany({ where: { machineId: id } });
      const ordered = [...parsed.data.images].sort(
        (a, b) => a.position - b.position
      );
      if (ordered.length > 0) {
        await tx.machineImage.createMany({
          data: ordered.map((image, index) => ({
            machineId: id,
            url: image.url,
            position: index,
          })),
        });
      }
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MACHINE_UPDATE',
          entity: `Machine:${row.slug}`,
        },
      });
      return row;
    });

    // Affected public pages: own detail + parent category detail (both
    // locales; old slug/category too when either changed).
    const detailPaths =
      existing.slug === updated.slug
        ? [`/machines/${updated.slug}`]
        : [`/machines/${existing.slug}`, `/machines/${updated.slug}`];
    const categoryPaths =
      existing.category.slug === updated.category.slug
        ? [`/categories/${updated.category.slug}`]
        : [
            `/categories/${existing.category.slug}`,
            `/categories/${updated.category.slug}`,
          ];
    // The home page's featured strip reads `featured`, so it is revalidated
    // whenever the flag could have changed. Doing it unconditionally is
    // correct and cheap: the alternative (comparing old vs new) would only
    // save one cache purge on an infrequent edit.
    revalidateWebPaths(['/', ...detailPaths, ...categoryPaths]);
    return { ok: true, slug: updated.slug };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] updateMachine failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteMachine(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const existing = await prisma.machine.findUnique({
    where: { id },
    include: { category: { select: { slug: true } } },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    // Images (Cascade) and related-machine join rows go with it — no
    // manual cleanup needed.
    await prisma.$transaction(async (tx) => {
      await tx.machine.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'MACHINE_DELETE',
          entity: `Machine:${existing.slug}`,
        },
      });
    });

    // Affected public pages: the home page (the row may have been in the
    // featured strip), the parent category detail (grid shrinks), and its own
    // detail path (so it flips to 404 promptly).
    revalidateWebPaths([
      '/',
      `/categories/${existing.category.slug}`,
      `/machines/${existing.slug}`,
    ]);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteMachine failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
