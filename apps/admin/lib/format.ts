import type { routing } from '@/i18n/routing';

type AdminLocale = (typeof routing.locales)[number];

// BCP-47 tags for the admin's `toLocaleDateString` / `toLocaleString` calls.
// Published dates, lead timestamps and audit-log entries are numbers the
// staff read, so the tag follows the admin's language instead of being
// pinned to 'en-GB' the way it was when the panel was English-only.
// `ar-EG` renders Arabic-Indic digits, matching the Arabic copy.
const INTL_LOCALES: Record<AdminLocale, string> = {
  ar: 'ar-EG',
  en: 'en-GB',
};

export function intlLocale(locale: AdminLocale): string {
  return INTL_LOCALES[locale];
}
