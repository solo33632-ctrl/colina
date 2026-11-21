'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import type { ActionResult } from '../admin-action';
import { requirePermission } from '../permissions';
import { revalidateWebPaths } from '../revalidate-web';
import { showcaseMessages } from './validation-messages';
import { showcaseInputSchema } from '../schemas';
import { mediaFieldIssues } from '../media-url';
import {
  SHOWCASE_AUDIT_SPEC,
  buildChanges,
  buildSnapshot,
} from '../audit-changes';
import { auditActor } from '../audit-actor';

const SHOWCASE_AUDIT_SELECT = {
  nameEn: true,
  nameAr: true,
  categoryId: true,
  category: { select: { nameEn: true } },
  descriptionEn: true,
  descriptionAr: true,
  beforeImageUrl: true,
  afterImageUrl: true,
} as const;

type ShowcaseAuditRow = {
  categoryId: string | null;
  category?: { nameEn: string } | null;
};

// The audit shows the production line by name; the legacy id is only the
// fallback for rows from before categories existed.
function withCategoryName<T extends ShowcaseAuditRow>(row: T) {
  return {
    ...row,
    category: row.category?.nameEn ?? row.categoryId ?? null,
  };
}

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('MaintenanceShowcase');
  const messages = showcaseMessages(t);
  return { parsed: showcaseInputSchema(messages).safeParse(input), messages };
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
  const session = await requirePermission('maintenance-showcase:write');
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

  // Stage 4c: a create has no stored photos, so both must already be on the
  // configured Cloudinary cloud.
  const mediaIssues = mediaFieldIssues([
    {
      field: 'beforeImageUrl',
      value: parsed.data.beforeImageUrl,
      message: messages.beforeImageUrl,
    },
    {
      field: 'afterImageUrl',
      value: parsed.data.afterImageUrl,
      message: messages.afterImageUrl,
    },
  ]);
  if (mediaIssues.length > 0) {
    return { ok: false, error: 'validation_failed', issues: mediaIssues };
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
          ...auditActor(session),
          action: 'MAINTENANCE_SHOWCASE_CREATE',
          entity: `MaintenanceShowcase:${row.id}`,
          details: buildSnapshot(row, SHOWCASE_AUDIT_SPEC),
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
  const session = await requirePermission('maintenance-showcase:write');
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
      const existing = await tx.maintenanceShowcase.findUnique({
        where: { id },
        select: SHOWCASE_AUDIT_SELECT,
      });
      if (!existing) {
        return { status: 'not_found' as const };
      }

      // Stage 4c: each exact stored photo stays saveable; a new or changed
      // photo must be on the configured Cloudinary cloud.
      const mediaIssues = mediaFieldIssues([
        {
          field: 'beforeImageUrl',
          value: parsed.data.beforeImageUrl,
          message: messages.beforeImageUrl,
          unchanged: existing.beforeImageUrl,
        },
        {
          field: 'afterImageUrl',
          value: parsed.data.afterImageUrl,
          message: messages.afterImageUrl,
          unchanged: existing.afterImageUrl,
        },
      ]);
      if (mediaIssues.length > 0) {
        return {
          status: 'validation_failed' as const,
          issues: mediaIssues,
        };
      }

      const row = await tx.maintenanceShowcase.update({
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
        select: SHOWCASE_AUDIT_SELECT,
      });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'MAINTENANCE_SHOWCASE_UPDATE',
          entity: `MaintenanceShowcase:${id}`,
          details: buildChanges(
            withCategoryName(existing),
            withCategoryName(row),
            SHOWCASE_AUDIT_SPEC
          ),
        },
      });
      return { status: 'ok' as const };
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

    revalidateWebPaths(['/', '/maintenance']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updateShowcase failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteShowcase(id: string): Promise<ActionResult> {
  const session = await requirePermission('maintenance-showcase:write');
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at MaintenanceShowcase: nothing to block on, straight delete.
  try {
    const deleted = await prisma.$transaction(async (tx) => {
      const existing = await tx.maintenanceShowcase.findUnique({
        where: { id },
        select: SHOWCASE_AUDIT_SELECT,
      });
      if (!existing) {
        return false;
      }
      await tx.maintenanceShowcase.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          ...auditActor(session),
          action: 'MAINTENANCE_SHOWCASE_DELETE',
          entity: `MaintenanceShowcase:${id}`,
          details: buildSnapshot(existing, SHOWCASE_AUDIT_SPEC, 'delete'),
        },
      });
      return true;
    });
    if (!deleted) {
      return { ok: false, error: 'not_found' };
    }

    revalidateWebPaths(['/', '/maintenance']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteShowcase failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
