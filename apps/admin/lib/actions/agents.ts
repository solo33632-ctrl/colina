'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { agentMessages } from './validation-messages';
import { agentInputSchema } from '../schemas';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('Agents');
  return agentInputSchema(agentMessages(t)).safeParse(input);
}

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

  const parsed = await parse(input);
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
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          cityAr: emptyToNull(parsed.data.cityAr) ?? null,
          cityEn: emptyToNull(parsed.data.cityEn) ?? null,
          addressAr: emptyToNull(parsed.data.addressAr) ?? null,
          addressEn: emptyToNull(parsed.data.addressEn) ?? null,
          phone: emptyToNull(parsed.data.phone) ?? null,
          email: emptyToNull(parsed.data.email) ?? null,
          // websiteUrl arrives normalized (null = cleared, otherwise a
          // trimmed absolute URL); logoUrl follows the partner logo shape.
          websiteUrl: parsed.data.websiteUrl,
          logoUrl: emptyToNull(parsed.data.logoUrl) ?? null,
          // The form always sends the switch; other clients get the
          // published default.
          isPublished: parsed.data.isPublished ?? true,
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

    // The public /agents page is built from this table, so both locale
    // variants of the listing are revalidated on a create.
    revalidateWebPaths(['/agents']);
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

  const parsed = await parse(input);
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
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn,
          cityAr: emptyToNull(parsed.data.cityAr),
          cityEn: emptyToNull(parsed.data.cityEn),
          addressAr: emptyToNull(parsed.data.addressAr),
          addressEn: emptyToNull(parsed.data.addressEn),
          phone: emptyToNull(parsed.data.phone),
          email: emptyToNull(parsed.data.email),
          // null clears a value; undefined leaves the stored column alone.
          websiteUrl: parsed.data.websiteUrl,
          logoUrl: emptyToNull(parsed.data.logoUrl),
          // undefined keeps the stored switch (see the schema note).
          isPublished: parsed.data.isPublished,
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

    // Same revalidation as createAgent (see there).
    revalidateWebPaths(['/agents']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] updateAgent failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

// Quick publish/hide switch used by the list: take an agent off the public
// page (or put it back) without opening the whole form. The audit's action
// names the resulting state, not the transition — `AGENT_HIDE Agent:…` tells
// the story at a glance, and there is no secret to launder through a detail.
export async function setAgentPublished(
  id: string,
  published: boolean
): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  try {
    const existing = await prisma.agent.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.agent.update({
        where: { id },
        data: { isPublished: published },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: published ? 'AGENT_PUBLISH' : 'AGENT_HIDE',
          entity: `Agent:${id}`,
        },
      });
    });

    // The list shows the new badge, and both /agents variants either gain
    // or lose the agent's cards.
    revalidateWebPaths(['/agents']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] setAgentPublished failed:', error);
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

    // Same revalidation as createAgent (see there).
    revalidateWebPaths(['/agents']);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteAgent failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
