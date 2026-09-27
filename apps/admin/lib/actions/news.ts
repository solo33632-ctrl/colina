'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { newsMessages } from './validation-messages';
import { newsInputSchema } from '../schemas';

// Validation messages come from the message files, in the admin's current
// language (see `validation-messages.ts`).
async function parse(input: unknown) {
  const t = await getTranslations('News');
  return newsInputSchema(newsMessages(t)).safeParse(input);
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: string }).code === 'P2002'
  );
}

function toDate(value: string | undefined): Date | undefined {
  if (!value) {
    return undefined;
  }
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export async function createNews(
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
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
    const publishedAt = toDate(parsed.data.publishedAt);
    const created = await prisma.$transaction(async (tx) => {
      const row = await tx.newsPost.create({
        data: {
          titleAr: parsed.data.titleAr,
          titleEn: parsed.data.titleEn,
          slug: parsed.data.slug,
          bodyAr: parsed.data.bodyAr,
          bodyEn: parsed.data.bodyEn,
          image: parsed.data.image || null,
          // Omitted date falls back to the schema default (now).
          ...(publishedAt ? { publishedAt } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'NEWS_CREATE',
          entity: `NewsPost:${row.slug}`,
        },
      });
      return row;
    });

    // No public consumer exists yet (no /news route as of Phase 7):
    // documented no-op so a future route only has to fill this in.
    revalidateWebPaths([]);
    return { ok: true, slug: created.slug };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] createNews failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function updateNews(
  id: string,
  input: unknown
): Promise<ActionResult<{ slug: string }>> {
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
    const existing = await prisma.newsPost.findUnique({ where: { id } });
    if (!existing) {
      return { ok: false, error: 'not_found' };
    }

    const publishedAt = toDate(parsed.data.publishedAt);
    const updated = await prisma.$transaction(async (tx) => {
      const row = await tx.newsPost.update({
        where: { id },
        data: {
          titleAr: parsed.data.titleAr,
          titleEn: parsed.data.titleEn,
          slug: parsed.data.slug,
          bodyAr: parsed.data.bodyAr,
          bodyEn: parsed.data.bodyEn,
          image: parsed.data.image || null,
          // Empty date keeps the stored value on update.
          ...(publishedAt ? { publishedAt } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'NEWS_UPDATE',
          entity: `NewsPost:${row.slug}`,
        },
      });
      return row;
    });

    // No public consumer exists yet (see createNews).
    revalidateWebPaths([]);
    return { ok: true, slug: updated.slug };
  } catch (error) {
    if (isUniqueViolation(error)) {
      return { ok: false, error: 'slug_taken' };
    }
    console.error('[admin] updateNews failed:', error);
    return { ok: false, error: 'server_error' };
  }
}

export async function deleteNews(id: string): Promise<ActionResult> {
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }

  // No relations point at NewsPost: nothing to block on.
  const existing = await prisma.newsPost.findUnique({ where: { id } });
  if (!existing) {
    return { ok: false, error: 'not_found' };
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.newsPost.delete({ where: { id } });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'NEWS_DELETE',
          entity: `NewsPost:${existing.slug}`,
        },
      });
    });

    // No public consumer exists yet (see createNews).
    revalidateWebPaths([]);
    return { ok: true };
  } catch (error) {
    console.error('[admin] deleteNews failed:', error);
    return { ok: false, error: 'server_error' };
  }
}
