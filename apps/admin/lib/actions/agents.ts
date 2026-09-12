'use server';

import { prisma } from '@colina/db';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { agentInputSchema } from '../schemas';

// Generic English messages for the action contract (see Phase 10
// categories.ts for the convention).
const SERVER_MESSAGES = {
  countryAr: 'Arabic country must be at least 2 characters.',
  countryEn: 'English country must be at least 2 characters.',
};

// Prisma optional text columns accept undefined (skip) — empty form
// strings normalize to null so "cleared" reads as cleared, not "".
function emptyToNull(value: string | undefined): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  return value.trim() === '' ? null : value;
}

export async function createAgent(
  input: unknown
): Promise<ActionResult<{ id: string }>> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = agentInputSchema(SERVER_MESSAGES).safeParse(input);
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
      const row = await tx.agent.create({
        data: {
          countryAr: parsed.data.countryAr,
          countryEn: parsed.data.countryEn,
          cityAr: emptyToNull(parsed.data.cityAr) ?? null,
          cityEn: emptyToNull(parsed.data.cityEn) ?? null,
          addressAr: emptyToNull(parsed.data.addressAr) ?? null,
          addressEn: emptyToNull(parsed.data.addressEn) ?? null,
          phone: emptyToNull(parsed.data.phone) ?? null,
          email: emptyToNull(parsed.data.email) ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'AGENT_CREATE',
          entity: `Agent:${row.id}`,
        },
      });
      return row;
    });

    // No public consumer exists yet (no /agents route as of Phase 7):
    // documented no-op so a future route only has to fill this in.
    revalidateWebPaths([]);
    return { ok: true, id: created.id };
  } catch (error) {
    console.error('[admin] createAgent failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateAgent(
  id: string,
  input: unknown
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  const parsed = agentInputSchema(SERVER_MESSAGES).safeParse(input);
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
    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id },
        data: {
          countryAr: parsed.data.countryAr,
          countryEn: parsed.data.countryEn,
          cityAr: emptyToNull(parsed.data.cityAr),
          cityEn: emptyToNull(parsed.data.cityEn),
          addressAr: emptyToNull(parsed.data.addressAr),
          addressEn: emptyToNull(parsed.data.addressEn),
          phone: emptyToNull(parsed.data.phone),
          email: emptyToNull(parsed.data.email),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'AGENT_UPDATE',
          entity: `Agent:${id}`,
        },
      });
    });

    // No public consumer exists yet (see createAgent).
    revalidateWebPaths([]);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updateAgent failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteAgent(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at Agent: nothing to block on.
  const existing = await prisma.agent.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.agent.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'AGENT_DELETE',
          entity: `Agent:${id}`,
        },
      });
    });

    // No public consumer exists yet (see createAgent).
    revalidateWebPaths([]);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteAgent failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
