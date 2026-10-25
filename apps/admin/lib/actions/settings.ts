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

  // Every contact field is already trimmed and null-normalized by the schema.
  // `latitude`/`longitude` are deliberately absent: the admin no longer edits
  // the map, and leaving the keys out means an ordinary save never overwrites
  // a pair stored by an earlier version (the web app still reads it until
  // stage 34b removes the map).
  const data = {
    whatsappNumber: parsed.data.whatsappNumber,
    whatsappMessageEn: greeting(parsed.data.whatsappMessageEn),
    whatsappMessageAr: greeting(parsed.data.whatsappMessageAr),
    contactPhone: parsed.data.contactPhone ?? null,
    contactEmail: parsed.data.contactEmail ?? null,
    factoryAddressEn: parsed.data.factoryAddressEn ?? null,
    factoryAddressAr: parsed.data.factoryAddressAr ?? null,
    workingHoursEn: parsed.data.workingHoursEn ?? null,
    workingHoursAr: parsed.data.workingHoursAr ?? null,
    mapsUrl: parsed.data.mapsUrl ?? null,
  };

  try {
    await prisma.$transaction(async (tx) => {
      // One row, id "main". Upsert rather than create-or-update: the first
      // save creates it, every later save updates it, and a page visit never
      // creates anything. The audit row is the same single SETTINGS_UPDATE
      // entry as before, even though the form now has two cards: it is still
      // one Save.
      await tx.siteSettings.upsert({
        where: { id: 'main' },
        create: { id: 'main', ...data },
        update: data,
      });
      await tx.auditLog.create({
        data: {
          adminUserId: session.user.id,
          action: 'SETTINGS_UPDATE',
          entity: 'SiteSettings:main',
        },
      });
    });

    // The WhatsApp settings render in the locale layout (button) and on
    // /contact (the number row); the factory location is also a /contact
    // concern. `revalidateWebPaths` expands each path to /ar and /en and has
    // no layout-level option, so those two page paths are the whole call.
    // The cross-app caveat in revalidate-web.ts still applies: this purges
    // admin's own cache, not apps/web's.
    revalidateWebPaths(['/', '/contact']);
    return { ok: true };
  } catch (error) {
    // Deliberately not the error itself: a Prisma failure can echo the input,
    // and the input now contains phone numbers, an email address and the
    // owner's contact copy. The error name is enough to tell an operator what
    // happened without writing any of that to a log.
    console.error(
      '[admin] saveSiteSettings failed:',
      error instanceof Error ? error.name : 'unknown error'
    );
    return { ok: false, error: 'server_error' };
  }
}
