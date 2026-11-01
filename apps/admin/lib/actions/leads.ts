'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@colina/db';
import { routing } from '@/i18n/routing';
import { requireAdmin, type ActionResult } from '../admin-action';
import {
  leadDeleteAuditEntity,
  type FoundLead,
  type LeadDeleteTarget,
} from '../leads-delete';

// Both roles may triage leads; only the audit-log *page* is
// SUPER_ADMIN-gated (see app/audit-log/page.tsx).
const updateLeadStatusInput = z.object({
  kind: z.enum(['contact', 'maintenance']),
  id: z.string().min(1),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
});

const leadTargetSchema = z.object({
  kind: z.enum(['contact', 'maintenance']),
  id: z.string().trim().min(1).max(64),
});

const deleteLeadInput = leadTargetSchema;

// A page holds 20 rows and the bulk bar can only select one page, so 50 is a
// backstop against a crafted call, not a limit the UI can reach.
const deleteLeadsInput = z.object({
  items: z.array(leadTargetSchema).min(1).max(50),
});

type DeleteCounts = { deleted: number; skipped: number };

function revalidateLeadViews() {
  // Lead rows feed the inbox, the dashboard's newest-leads panel and the
  // sidebar's new-lead badge. Revalidating each locale's layout covers all
  // three (the badge lives in the layout) without touching any public page.
  for (const locale of routing.locales) {
    revalidatePath(`/${locale}`, 'layout');
  }
}

/** De-duplicates repeated targets so one row cannot be counted twice. */
function uniqueTargets(items: LeadDeleteTarget[]): LeadDeleteTarget[] {
  const unique = new Map<string, LeadDeleteTarget>();
  for (const item of items) {
    unique.set(`${item.kind}:${item.id}`, item);
  }
  return [...unique.values()];
}

async function performDelete(
  adminUserId: string,
  requested: LeadDeleteTarget[]
): Promise<ActionResult<DeleteCounts>> {
  const items = uniqueTargets(requested);
  const contactIds = items
    .filter((item) => item.kind === 'contact')
    .map((item) => item.id);
  const maintenanceIds = items
    .filter((item) => item.kind === 'maintenance')
    .map((item) => item.id);

  try {
    const counts = await prisma.$transaction(async (tx) => {
      // Read only the internal fields the audit entry needs. Names, phones,
      // emails and message bodies are never selected, so they cannot reach
      // the audit payload even by accident.
      const [contacts, requests] = await Promise.all([
        tx.contactMessage.findMany({
          where: { id: { in: contactIds } },
          select: { id: true, createdAt: true },
        }),
        tx.maintenanceRequest.findMany({
          where: { id: { in: maintenanceIds } },
          select: { id: true, createdAt: true },
        }),
      ]);

      const [contactDelete, requestDelete] = await Promise.all([
        tx.contactMessage.deleteMany({
          where: { id: { in: contacts.map((row) => row.id) } },
        }),
        tx.maintenanceRequest.deleteMany({
          where: { id: { in: requests.map((row) => row.id) } },
        }),
      ]);

      const deleted = contactDelete.count + requestDelete.count;
      const found: FoundLead[] = [
        ...contacts.map((row) => ({
          kind: 'contact' as const,
          id: row.id,
          receivedAt: row.createdAt,
        })),
        ...requests.map((row) => ({
          kind: 'maintenance' as const,
          id: row.id,
          receivedAt: row.createdAt,
        })),
      ];

      await tx.auditLog.create({
        data: {
          adminUserId,
          // Fixed code, not a per-row action: one call is one audited event.
          action: 'DELETE',
          entity: leadDeleteAuditEntity({
            requested: items,
            found,
            deleted,
          }),
        },
      });

      return { deleted, skipped: items.length - deleted };
    });

    // A no-op call (every id already gone) changes nothing to invalidate.
    if (counts.deleted > 0) {
      revalidateLeadViews();
    }
    return { ok: true, ...counts };
  } catch (error) {
    // Never surface a Prisma message: it can name columns or connection
    // details the admin UI has no business showing.
    console.error('[admin] deleteLeads failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteLead(
  input: unknown
): Promise<ActionResult<DeleteCounts>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = deleteLeadInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed' };
  }

  return performDelete(session.user.id, [parsed.data]);
}

export async function deleteLeads(
  input: unknown
): Promise<ActionResult<DeleteCounts>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = deleteLeadsInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: 'validation_failed' };
  }

  return performDelete(session.user.id, parsed.data.items);
}

export async function updateLeadStatus(input: unknown) {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false as const, error: 'unauthorized' };
  }

  const parsed = updateLeadStatusInput.safeParse(input);
  if (!parsed.success) {
    return { ok: false as const, error: 'validation_failed' };
  }

  const { kind, id, status } = parsed.data;

  // Explicit branches (not a shared union): the two delegates have
  // incompatible call signatures, so a single `model` variable won't
  // typecheck.
  const existing =
    kind === 'contact'
      ? await prisma.contactMessage.findUnique({ where: { id } })
      : await prisma.maintenanceRequest.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false as const, error: 'not_found' };
  }

  const entity =
    kind === 'contact' ? `ContactMessage:${id}` : `MaintenanceRequest:${id}`;
  await prisma.$transaction(async (tx) => {
    if (kind === 'contact') {
      await tx.contactMessage.update({ where: { id }, data: { status } });
    } else {
      await tx.maintenanceRequest.update({ where: { id }, data: { status } });
    }
    await tx.auditLog.create({
      data: {
        adminUserId: session.user.id,
        action: 'LEAD_STATUS_UPDATE',
        entity: `${entity} -> ${status}`,
      },
    });
  });

  // Deliberately no revalidateWebPaths: lead rows are never rendered on
  // any public page (Phase 12 inbox only).
  return { ok: true as const };
}
