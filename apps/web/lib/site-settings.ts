import { cache } from 'react';
import { prisma } from '@colina/db';
import {
  sanitizeContactEmail,
  sanitizeContactPhone,
  sanitizeMapsUrl,
  trimmedOrNull,
} from './contact';
import { isValidWhatsappNumber } from './whatsapp';

/**
 * The site settings the public web app needs.
 *
 * WhatsApp messages stay as stored (the caller falls back to the locale's
 * default when one is blank); the number is re-validated, so `whatsappNumber`
 * is either a usable international number or `null`.
 *
 * Contact details are display values and are re-validated on read: the phone
 * is the stored text when it is plausible, the email is the stored address
 * when it is usable, `mapsUrl` is either an absolute https URL or `null`, and
 * the free-text fields are trimmed with a blank meaning `null`. Consumers
 * never have to repair a half-saved row.
 */
export type SiteSettings = {
  whatsappNumber: string | null;
  whatsappMessageEn: string | null;
  whatsappMessageAr: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  factoryAddressEn: string | null;
  factoryAddressAr: string | null;
  workingHoursEn: string | null;
  workingHoursAr: string | null;
  mapsUrl: string | null;
};

const NO_SETTINGS: SiteSettings = {
  whatsappNumber: null,
  whatsappMessageEn: null,
  whatsappMessageAr: null,
  contactPhone: null,
  contactEmail: null,
  factoryAddressEn: null,
  factoryAddressAr: null,
  workingHoursEn: null,
  workingHoursAr: null,
  mapsUrl: null,
};

/**
 * Reads the singleton settings row for the public site.
 *
 * Deliberately selects only the columns the public app renders: the row is an
 * admin record, and the public app has no business reading its timestamps or
 * the retired map coordinates.
 *
 * A missing table, a connection failure or an unexpected value must never take
 * a public page down, so every failure collapses to "no settings". The log
 * carries the error NAME only — a Prisma error can echo the input, and the
 * input contains a phone number and a factory address.
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
        contactPhone: true,
        contactEmail: true,
        factoryAddressEn: true,
        factoryAddressAr: true,
        workingHoursEn: true,
        workingHoursAr: true,
        mapsUrl: true,
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
      contactPhone: sanitizeContactPhone(row.contactPhone),
      contactEmail: sanitizeContactEmail(row.contactEmail),
      factoryAddressEn: trimmedOrNull(row.factoryAddressEn),
      factoryAddressAr: trimmedOrNull(row.factoryAddressAr),
      workingHoursEn: trimmedOrNull(row.workingHoursEn),
      workingHoursAr: trimmedOrNull(row.workingHoursAr),
      mapsUrl: sanitizeMapsUrl(row.mapsUrl),
    };
  } catch (error) {
    console.error(
      '[web] getSiteSettings failed:',
      error instanceof Error ? error.name : 'unknown error'
    );
    return NO_SETTINGS;
  }
});
