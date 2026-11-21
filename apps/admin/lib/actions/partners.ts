'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import type { ActionResult } from '../admin-action';
import { requirePermission } from '../permissions';
import {
  buildChanges,
  buildSnapshot,
  PARTNER_AUDIT_SPEC,
} from '../audit-changes';
import { auditActor } from '../audit-actor';
import { revalidateWebPaths } from '../revalidate-web';
import { partnerMessages } from './validation-messages';
import { partnerInputSchema } from '../schemas';
import { mediaFieldIssues } from '../media-url';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('Partners');
  const messages = partnerMessages(t);
  return { parsed: partnerInputSchema(messages).safeParse(input), messages };
}

export async function createPartner(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await requirePermission('partners:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const { parsed, messages } = await parse(input);
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

  const mediaIssues = mediaFieldIssues([
    {
      field: 'logo',
      value: parsed.data.logo,
      optional: true,
      message: messages.logo,
    },
  ]);
  if (mediaIssues.length > 0) {
    return { ok: false, error: 'validation_failed', issues: mediaIssues };
  }

  try {
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.partner.create({
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          logo: parsed.data.logo || null,
        },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'PARTNER_CREATE',
          entity: `Partner:${row.id}`,
          details: buildSnapshot(row, PARTNER_AUDIT_SPEC),
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
  const session = await requirePermission('partners:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const { parsed, messages } = await parse(input);
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
    const outcome = await prisma.$transaction(async (tx) => {
      // The before-row is read inside the same transaction as the write, so
      // the diff and the write see the same committed state.
      const existing = await tx.partner.findUnique({
        where: { id },
        select: { nameAr: true, nameEn: true, logo: true },
      });
      if (!existing) {
        return { status: 'not_found' as const };
      }

      // Stage 4c: an exact stored logo stays saveable (legacy rows); a new or
      // changed logo must be on the configured Cloudinary cloud.
      const mediaIssues = mediaFieldIssues([
        {
          field: 'logo',
          value: parsed.data.logo,
          optional: true,
          message: messages.logo,
          unchanged: existing.logo,
        },
      ]);
      if (mediaIssues.length > 0) {
        return {
          status: 'validation_failed' as const,
          issues: mediaIssues,
        };
      }

      const row = await tx.partner.update({
        where: { id },
        data: {
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          logo: parsed.data.logo || null,
        },
        select: { nameAr: true, nameEn: true, logo: true },
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'PARTNER_UPDATE',
          entity: `Partner:${id}`,
          details: buildChanges(existing, row, PARTNER_AUDIT_SPEC),
        },
      });
      return { status: 'ok' as const, row };
    });
    if (outcome.status === 'not_found') {
      return { ok: false, error: 'not_found' };
    }
    if (outcome.status === 'validation_failed') {
      return {
        ok: false,
        error: 'validation_failed',
        issues: outcome.issues,
      };
    }

    revalidateWebPaths(['/', '/partners']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updatePartner failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deletePartner(id: string): Promise<ActionResult> {
  const session = await requirePermission('partners:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at Partner: nothing to block on, straight delete.
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.partner.findUnique({
        where: { id },
        select: { nameAr: true, nameEn: true, logo: true },
      });
      if (!existing) {
        return false;
      }

      await tx.partner.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'PARTNER_DELETE',
          entity: `Partner:${id}`,
          details: buildSnapshot(existing, PARTNER_AUDIT_SPEC, 'delete'),
        },
      });
      return true;
    });
    if (!deleted) {
      return { ok: false, error: 'not_found' };
    }

    revalidateWebPaths(['/', '/partners']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deletePartner failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
