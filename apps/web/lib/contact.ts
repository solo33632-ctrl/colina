/**
 * Contact details shown on the public site.
 *
 * The `SiteSettings` row is untrusted input: it can be old, hand-edited or
 * half-migrated. Every value is re-validated here before it becomes visible
 * text or an href, so a bad row hides that row instead of producing a broken
 * `tel:`, `mailto:` or maps link.
 */

/** Trimmed text, or null for a blank/absent value. */
export function trimmedOrNull(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

/**
 * The phone number as the owner typed it, or null.
 *
 * The display value keeps its formatting (that is the point of a display
 * phone), but only characters a person can reasonably type in a phone number
 * are allowed, it must contain at least six digits, and it may not exceed 30
 * characters. The admin applies the same rule on write; this is the read-side
 * guard for a stale or hand-edited row.
 */
export function sanitizeContactPhone(
  value: string | null | undefined
): string | null {
  const trimmed = trimmedOrNull(value);
  if (trimmed === null || trimmed.length > 30) {
    return null;
  }
  if (!/^[0-9+\-(). ]+$/.test(trimmed)) {
    return null;
  }
  const digits = trimmed.replace(/[^0-9]/g, '');
  return digits.length >= 6 ? trimmed : null;
}

/**
 * The email address, or null.
 *
 * Deliberately looser than the admin's zod rule: this is a read-side guard,
 * not a form. It only requires what the public page needs to build a usable
 * `mailto:` link — one `@`, no whitespace, a dot in the domain and a sane
 * length.
 */
export function sanitizeContactEmail(
  value: string | null | undefined
): string | null {
  const trimmed = trimmedOrNull(value);
  if (trimmed === null || trimmed.length > 254) {
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
    return null;
  }
  return trimmed;
}

/**
 * The stored location link, trimmed, only when it is an absolute https URL.
 * `http:`, `javascript:`, `data:` and relative paths are all ignored.
 */
export function sanitizeMapsUrl(
  value: string | null | undefined
): string | null {
  const trimmed = trimmedOrNull(value);
  if (trimmed === null) {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.hostname === '') {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

/**
 * A `tel:` href containing only the leading `+` (when present) and digits.
 * The visible text stays exactly as stored; this is only the dialable value.
 */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^0-9]/g, '');
  return `tel:${trimmed.startsWith('+') ? '+' : ''}${digits}`;
}
