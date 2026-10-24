'use server';

import { prisma } from '@colina/db';
import { getTranslations } from 'next-intl/server';
import { requireAdmin, type ActionResult } from '../admin-action';
import { revalidateWebPaths } from '../revalidate-web';
import { siteSettingsMessages } from './validation-messages';
import { siteSettingsInputSchema } from '../schemas';

// Same translated-schema pattern as every other action: the rules live in
// `lib/schemas.ts`, the wording comes from the current admin locale.
async function parse(input: unknown) {
  const t = await getTranslations('Settings');
  return siteSettingsInputSchema(siteSettingsMessages(t)).safeParse(input);
}

// A blank greeting is "use the standard greeting", not an empty message, so
// it is stored as null. The value is otherwise kept as typed (including
// internal line breaks).
function greeting(value: string | undefined): string | null {
  return value && value.trim() !== '' ? value : null;
}

export async function saveSiteSettings(input: unknown): Promise<ActionResult> {
  // Any signed-in admin passes this first check; the role check below is the
  // same SUPER_ADMIN gate the insights dashboard and audit log use. Splitting
  // the two means an expired session still comes back as `unauthorized`
  // rather than masquerading as a permissions problem.
  const session = await requireAdmin();
  if (!session) {
    return { ok: false, error: 'unauthorized' };
  }
  if (session.user.role !== 'SUPER_ADMIN') {
    return { ok: false, error: 'forbidden' };
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
    await prisma.$transaction(async (tx) => {
      // One row, id "main". Upsert rather than create-or-update: the first
      // save creates it, every later save updates it, and a page visit never
      // creates anything.
      await tx.siteSettings.upsert({
        where: { id: 'main' },
        create: {
          id: 'main',
          whatsappNumber: parsed.data.whatsappNumber,
          whatsappMessageEn: greeting(parsed.data.whatsappMessageEn),
          whatsappMessageAr: greeting(parsed.data.whatsappMessageAr),
        },
        update: {
          whatsappNumber: parsed.data.whatsappNumber,
          whatsappMessageEn: greeting(parsed.data.whatsappMessageEn),
          whatsappMessageAr: greeting(parsed.data.whatsappMessageAr),
        },
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SETTINGS_UPDATE',
          entity: 'SiteSettings:main',
        },
      });
    });

    // Settings currently affect the home page. `revalidateWebPaths` expands
    // this to /ar and /en and has no layout-level option (it revalidates
    // page paths only), so '/' is the whole call.
    revalidateWebPaths(['/']);
    return { ok: true };
  } catch (error) {
    // Deliberately not the error itself: a Prisma failure can echo the input,
    // and the input contains a phone number. The error name is enough to tell
    // an operator what happened without writing the number to a log.
    console.error(
      '[admin] saveSiteSettings failed:',
      error instanceof Error ? error.name : 'unknown error'
    );
    return { ok: false, error: 'server_error' };
  }
}
