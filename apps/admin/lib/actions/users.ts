'use server';

import argon2 from 'argon2';
import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { after } from 'next/server';
import type { ActionResult } from '../admin-action';
import { auditActor } from '../audit-actor';
import {
  ADMIN_USER_AUDIT_SPEC,
  buildSnapshot,
  type AuditDetails,
} from '../audit-changes';
import { adminDeleteBlock } from '../admin-users';
import {
  deleteCategoryInTransaction,
  deleteMachineInTransaction,
} from '../entity-delete';
import { requirePermission } from '../permissions';
import { revalidateWebPaths } from '../revalidate-web';
import {
  adminUserCreateSchema,
  adminUserDeleteSchema,
  adminUserPasswordResetSchema,
} from '../schemas';
import { adminUserMessages } from './validation-messages';

// Stage 4b: admin account management is SUPER_ADMIN-only (`users:manage`).
// The mutation surface is deliberately narrow: create EDITOR accounts, reset
// an EDITOR's password, delete an EDITOR. No action can create or promote a
// full admin, and no action can touch the acting account.

async function createSchema() {
  const t = await getTranslations('Users');
  return adminUserCreateSchema(adminUserMessages(t));
}

async function passwordResetSchema() {
  const t = await getTranslations('Users');
  return adminUserPasswordResetSchema({
    password: t('validation.password'),
  });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function isMissingRow(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2025'
  );
}

/** A reset has no field diff; the sentence only needs the target's email. */
function accountLabelDetails(email: string): AuditDetails {
  return {
    changes: [],
    label: { en: email, ar: email },
    search: email.toLowerCase(),
  };
}

export async function createEditor(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission('users:manage');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = (await createSchema()).safeParse(input);
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
      const row = await tx.adminUser.create({
        data: {
          // The only role this area can create. Never take a role from input.
          role: 'EDITOR',
          name: parsed.data.name,
          email: parsed.data.email,
          // Plaintext exists only in this request; only the hash is stored.
          passwordHash: await argon2.hash(parsed.data.password),
        },
        select: { id: true, name: true, email: true, role: true },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'USER_CREATE',
          entity: `AdminUser:${row.id}`,
          details: buildSnapshot(row, ADMIN_USER_AUDIT_SPEC),
        },
      });
      return row;
    });

    return { ok: true, id: created.id };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'email_taken' };
    }
    console.error('[admin] createEditor failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function resetEditorPassword(
  input: unknown
): Promise<ActionResult> {
  const session = await requirePermission('users:manage');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = (await passwordResetSchema()).safeParse(input);
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

  const target = await prisma.adminUser.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, email: true, role: true },
  });
  if (!target) {
    return { ok: false, error: 'not_found' };
  }
  // The UI only offers editor rows; the server enforces the same boundary.
  if (target.role === 'SUPER_ADMIN') {
    return { ok: false, error: 'protected_account' };
  }

  const passwordHash = await argon2.hash(parsed.data.password);

  try {
    await prisma.$transaction(async (tx) => {
      // Bumping sessionVersion revokes every JWT issued with the old
      // credential; the verified-session check rejects them on next use.
      await tx.adminUser.update({
        where: { id: target.id },
        data: {
          passwordHash,
          passwordResetTokenHash: null,
          passwordResetTokenExpiresAt: null,
          sessionVersion: { increment: 1 },
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'USER_PASSWORD_RESET',
          entity: `AdminUser:${target.id}`,
          details: accountLabelDetails(target.email),
        },
      });
    });
    return { ok: true };
  } catch (error) {
    if (isMissingRow(error)) {
      return { ok: false, error: 'not_found' };
    }
    console.error('[admin] resetEditorPassword failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export type DeletedCategorySummary = {
  nameEn: string;
  nameAr: string;
};

export type DeleteAdminUserResult = {
  removedAuditRows: number;
  deletedMachines: number;
  deletedCategories: number;
  /** Categories kept because they still hold another owner's machines. */
  blockedCategories: DeletedCategorySummary[];
};

export async function deleteAdminUser(
  input: unknown
): Promise<ActionResult<DeleteAdminUserResult>> {
  const session = await requirePermission('users:manage');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = adminUserDeleteSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed' };
  }

  const target = await prisma.adminUser.findUnique({
    where: { id: parsed.data.id },
    select: { id: true, name: true, email: true, role: true },
  });
  if (!target) {
    return { ok: false, error: 'not_found' };
  }

  const superAdminCount =
    target.role === 'SUPER_ADMIN'
      ? await prisma.adminUser.count({ where: { role: 'SUPER_ADMIN' } })
      : 0;
  const block = adminDeleteBlock({
    actorId: session.user.id,
    targetId: target.id,
    targetRole: target.role,
    superAdminCount,
  });
  if (block) {
    return { ok: false, error: block };
  }

  const needsEmail =
    parsed.data.mode === 'account_and_audit' || parsed.data.deleteContent;
  if (needsEmail && parsed.data.confirmEmail !== target.email) {
    return { ok: false, error: 'email_mismatch' };
  }

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Re-read inside the transaction: the snapshot and the content counts
      // must describe the row that is actually deleted.
      const current = await tx.adminUser.findUnique({
        where: { id: target.id },
        select: { id: true, name: true, email: true, role: true },
      });
      if (!current) {
        return null;
      }

      let removedAuditRows = 0;
      if (parsed.data.mode === 'account_and_audit') {
        // The deleteMany result is the exact number removed, not a count that
        // could drift from the deletion it describes. Mode A removes none.
        const removed = await tx.auditLog.deleteMany({
          where: { adminUserId: current.id },
        });
        removedAuditRows = removed.count;
      }

      const publicPaths: string[] = [];
      let deletedMachines = 0;
      let deletedCategories = 0;
      const blockedCategories: DeletedCategorySummary[] = [];

      if (parsed.data.deleteContent) {
        // Machines first: a category can only be deleted once its machines
        // are gone, and the normal has-machines rule still protects any row
        // holding someone else's machine.
        const machines = await tx.machine.findMany({
          where: { createdById: current.id },
          select: { id: true },
        });
        for (const machine of machines) {
          const deleted = await deleteMachineInTransaction(
            tx,
            machine.id,
            session
          );
          if (deleted.ok) {
            deletedMachines += 1;
            publicPaths.push(
              '/',
              `/categories/${deleted.categorySlug}`,
              `/machines/${deleted.slug}`
            );
          }
        }

        const categories = await tx.machineCategory.findMany({
          where: { createdById: current.id },
          select: { id: true, nameAr: true, nameEn: true },
        });
        for (const category of categories) {
          const deleted = await deleteCategoryInTransaction(
            tx,
            category.id,
            session
          );
          if (deleted.ok) {
            deletedCategories += 1;
            publicPaths.push('/', '/categories', `/categories/${deleted.slug}`);
          } else if (deleted.error === 'has_machines') {
            blockedCategories.push({
              nameEn: category.nameEn,
              nameAr: category.nameAr,
            });
          }
        }
      }

      // The account goes last: every FK that points at it is either already
      // handled (content) or set to NULL by the schema (createdById, audit).
      await tx.adminUser.delete({ where: { id: current.id } });

      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'USER_DELETE',
          entity: `AdminUser:${current.id}`,
          details: buildSnapshot(
            {
              name: current.name,
              email: current.email,
              mode: parsed.data.mode,
              auditRows: removedAuditRows,
              machines: deletedMachines,
              categories: deletedCategories,
            },
            ADMIN_USER_AUDIT_SPEC,
            'delete'
          ),
        },
      });

      return {
        removedAuditRows,
        deletedMachines,
        deletedCategories,
        blockedCategories,
        publicPaths,
      };
    });

    if (!result) {
      return { ok: false, error: 'not_found' };
    }

    if (result.publicPaths.length > 0) {
      // The result dialog lives inside the deleted account's table row, so a
      // client refresh before the admin reads it would unmount the counts and
      // the kept-category list. Revalidating after the response keeps the
      // public pages fresh without refreshing the users page mid-result.
      after(() => revalidateWebPaths([...new Set(result.publicPaths)]));
    }

    return {
      ok: true,
      removedAuditRows: result.removedAuditRows,
      deletedMachines: result.deletedMachines,
      deletedCategories: result.deletedCategories,
      blockedCategories: result.blockedCategories,
    };
  } catch (error) {
    if (isMissingRow(error)) {
      return { ok: false, error: 'not_found' };
    }
    console.error('[admin] deleteAdminUser failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
