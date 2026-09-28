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

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Ordered largest first, so the first unit the difference fills is the one an
// operator would say out loud ("2 hours ago", not "120 minutes ago").
const RELATIVE_UNITS = [
  { unit: 'year', ms: 365 * DAY_MS },
  { unit: 'month', ms: 30 * DAY_MS },
  { unit: 'week', ms: 7 * DAY_MS },
  { unit: 'day', ms: DAY_MS },
  { unit: 'hour', ms: HOUR_MS },
  { unit: 'minute', ms: MINUTE_MS },
] as const;

/**
 * Localized relative date, e.g. "2 days ago" / "قبل يومين".
 *
 * Returns `null` under a minute old: the platform's own wording for a
 * zero-minute difference is "this minute" / "هذه الدقيقة", which reads like a
 * timestamp rather than a relative date, so the caller supplies its own
 * "just now" copy instead.
 */
export function relativeTime(
  date: Date,
  locale: AdminLocale,
  now: Date = new Date()
): string | null {
  const elapsed = date.getTime() - now.getTime();
  const absolute = Math.abs(elapsed);
  const unit = RELATIVE_UNITS.find(({ ms }) => absolute >= ms);
  if (!unit) {
    return null;
  }
  // `numeric: 'auto'` gives the natural wording ("yesterday" / "أمس") for the
  // ±1 case; the arithmetic is signed, so past dates read as "… ago".
  return new Intl.RelativeTimeFormat(intlLocale(locale), {
    numeric: 'auto',
  }).format(Math.round(elapsed / unit.ms), unit.unit);
}
