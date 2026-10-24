/**
 * WhatsApp link rules shared by the floating button and the contact row.
 *
 * The admin stores a number as digits only (Stage 32a), but a public page must
 * not trust that blindly: an old row, a manual edit or a half-finished
 * migration can leave something that is not a usable international number.
 * Every surface validates before rendering, so a bad value means "no WhatsApp"
 * rather than a broken `wa.me` link on every page.
 */

/** E.164 allows up to 15 digits; 8 is the shortest plausible country+number. */
export const WHATSAPP_NUMBER_MIN_LENGTH = 8;
export const WHATSAPP_NUMBER_MAX_LENGTH = 15;

/**
 * True only for a digits-only international number that can be used in a
 * `wa.me` path: 8–15 digits and no leading zero (the country code never starts
 * with one). Deliberately strict — a "+", spaces or a local leading zero are
 * treated as "no WhatsApp" instead of being silently repaired.
 */
export function isValidWhatsappNumber(
  value: string | null | undefined
): value is string {
  return (
    typeof value === 'string' &&
    /^\d+$/.test(value) &&
    value.length >= WHATSAPP_NUMBER_MIN_LENGTH &&
    value.length <= WHATSAPP_NUMBER_MAX_LENGTH &&
    !value.startsWith('0')
  );
}

/**
 * The public `wa.me` URL for a number and pre-filled greeting.
 *
 * `encodeURIComponent` is the whole point: a greeting can contain spaces,
 * ampersands and Arabic, all of which would otherwise break the query string.
 * An empty (or whitespace-only) greeting omits `text` entirely — WhatsApp then
 * opens with its own empty composer rather than a blank `text=` parameter.
 */
export function buildWhatsappUrl(number: string, message: string): string {
  const url = `https://wa.me/${number}`;
  const text = message.trim();
  return text ? `${url}?text=${encodeURIComponent(text)}` : url;
}
