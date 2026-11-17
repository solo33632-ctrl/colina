import type { Prisma } from '@colina/db';
import type { AdminSession } from './admin-action';
import {
  buildSnapshot,
  CATEGORY_AUDIT_SPEC,
  MACHINE_AUDIT_SPEC,
} from './audit-changes';
import { auditActor } from './audit-actor';
import { canModifyEntity } from './permissions';

/**
 * The machine/category delete operations, extracted so Stage 4b's account
 * deletion reuses exactly the rules the ordinary delete buttons use — the
 * same ownership check, cascade behavior, `has_machines` block, snapshot and
 * audit row — inside its own single transaction.
 *
 * Callers own the transaction and the post-commit revalidation.
 */
export type Transaction = Prisma.TransactionClient;

export type DeleteMachineOutcome =
  | { ok: true; slug: string; categorySlug: string }
  | { ok: false; error: 'not_found' };

export async function deleteMachineInTransaction(
  tx: Transaction,
  id: string,
  session: AdminSession
): Promise<DeleteMachineOutcome> {
  const existing = await tx.machine.findUnique({
    where: { id },
    select: {
      createdById: true,
      nameAr: true,
      nameEn: true,
      slug: true,
      category: { select: { slug: true } },
    },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }
  // A guessed id must behave exactly like a missing row. EDITOR only modifies
  // machines it created; null creator means full-admin only.
  if (!canModifyEntity(session, existing)) {
    return { ok: false, error: 'not_found' };
  }

  // Images (Cascade) and related-machine join rows go with it — no manual
  // cleanup needed.
  await tx.machine.delete({ where: { id } });
  await tx.auditLog.create({
    data: {
      ...auditActor(session),
      action: 'MACHINE_DELETE',
      entity: `Machine:${existing.slug}`,
      details: buildSnapshot(existing, MACHINE_AUDIT_SPEC, 'delete'),
    },
  });
  return {
    ok: true,
    slug: existing.slug,
    categorySlug: existing.category.slug,
  };
}

export type DeleteCategoryOutcome =
  | { ok: true; slug: string }
  | { ok: false; error: 'not_found' }
  | { ok: false; error: 'has_machines'; machineCount: number };

export async function deleteCategoryInTransaction(
  tx: Transaction,
  id: string,
  session: AdminSession
): Promise<DeleteCategoryOutcome> {
  const existing = await tx.machineCategory.findUnique({
    where: { id },
    include: { _count: { select: { machines: true } } },
  });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }
  // Ownership of the category is a separate question from the machines it
  // holds: an editor may only delete a category it created, and even then the
  // existing "no machines" rule below still applies (the FK is Restrict).
  if (!canModifyEntity(session, existing)) {
    return { ok: false, error: 'not_found' };
  }
  if (existing._count.machines > 0) {
    return {
      ok: false,
      error: 'has_machines',
      machineCount: existing._count.machines,
    };
  }

  await tx.machineCategory.delete({ where: { id } });
  await tx.auditLog.create({
    data: {
      ...auditActor(session),
      action: 'CATEGORY_DELETE',
      entity: `MachineCategory:${existing.slug}`,
      details: buildSnapshot(existing, CATEGORY_AUDIT_SPEC, 'delete'),
    },
  });
  return { ok: true, slug: existing.slug };
}
