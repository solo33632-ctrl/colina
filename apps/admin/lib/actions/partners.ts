'use server';

import { prisma } from '@colina/db';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { partnerInputSchema } from '../schemas';

// Generic English messages for the action contract (see Phase 10
// categories.ts for the convention).
const SERVER_MESSAGES = {
  nameAr: 'Arabic name must be at least 2 characters.',
  nameEn: 'English name must be at least 2 characters.',
  logo: 'Logo URL must not be empty.',
};

export async function createPartner(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = partnerInputSchema(SERVER_MESSAGES).safeParse(input);
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
      const row = await tx.partner.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          logo: parsed.data.logo,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'PARTNER_CREATE',
          entity: `Partner:${row.id}`,
        },
      });
      return row;
    });

    // Affected public pages: home strip + listing (both locales).
    revalidateWebPaths(['/', '/partners']);
    return { ok: true, id: created.id };
  } catch (error) {
    console.error('[admin] createPartner failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updatePartner(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = partnerInputSchema(SERVER_MESSAGES).safeParse(input);
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
    const existing = await prisma.partner.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.partner.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          logo: parsed.data.logo,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'PARTNER_UPDATE',
          entity: `Partner:${id}`,
        },
      });
    });

    revalidateWebPaths(['/', '/partners']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updatePartner failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deletePartner(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at Partner: nothing to block on, straight delete.
  const existing = await prisma.partner.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.partner.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'PARTNER_DELETE',
          entity: `Partner:${id}`,
        },
      });
    });

    revalidateWebPaths(['/', '/partners']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deletePartner failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
