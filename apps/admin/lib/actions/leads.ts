'use server';

import { z } from 'zod';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';

// Both roles may triage leads; only the audit-log *page* is
// SUPER_ADMIN-gated (see app/audit-log/page.tsx).
const updateLeadStatusInput = z.object({
  kind: z.enum(['contact', 'maintenance']),
  id: z.string().min(1),
  status: z.enum(['NEW', 'IN_PROGRESS', 'RESOLVED']),
});

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
