import { cache } from 'react';
import { prisma } from '@colina/db';
import { isValidWhatsappNumber } from './whatsapp';

/**
 * The only site settings the public web app needs.
 *
 * Messages stay as stored (the caller falls back to the locale's default when
 * one is blank); the number is already re-validated, so `whatsappNumber` is
 * either a usable international number or `null`.
 */
export type SiteSettings = {
  whatsappNumber: string | null;
  whatsappMessageEn: string | null;
  whatsappMessageAr: string | null;
};

const NO_SETTINGS: SiteSettings = {
  whatsappNumber: null,
  whatsappMessageEn: null,
  whatsappMessageAr: null,
};

/**
 * Reads the singleton settings row for the public site.
 *
 * Deliberately selects only the three WhatsApp columns: the row is an admin
 * record, and the public app has no business reading its timestamps.
 *
 * A missing table, a connection failure or an unexpected value must never take
 * a public page down, so every failure collapses to "no WhatsApp". The log
 * carries the error NAME only — a Prisma error can echo the input, and the
 * input here is a phone number.
 *
 * `cache()` deduplicates the read within one request tree: the locale layout
 * and the contact page both ask for the settings, and a single render should
 * hit the database once. It does not make a route dynamic; static pages are
 * still generated and ISR pages still revalidate on their window.
 */
export const getSiteSettings = cache(async (): Promise<SiteSettings> => {
  try {
    const row = await prisma.siteSettings.findUnique({
      where: { id: 'main' },
      select: {
        whatsappNumber: true,
        whatsappMessageEn: true,
        whatsappMessageAr: true,
      },
    });

    if (!row) {
      return NO_SETTINGS;
    }

    return {
      whatsappNumber: isValidWhatsappNumber(row.whatsappNumber)
        ? row.whatsappNumber
        : null,
      whatsappMessageEn: row.whatsappMessageEn,
      whatsappMessageAr: row.whatsappMessageAr,
    };
  } catch (error) {
    console.error(
      '[web] getSiteSettings failed:',
      error instanceof Error ? error.name : 'unknown error'
    );
    return NO_SETTINGS;
  }
});
