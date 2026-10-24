/**
 * Normalizes what an admin types into a WhatsApp number into the exact digits
 * a `https://wa.me/...` link takes.
 *
 * The stored value is never the raw input: spaces, hyphens, dots and
 * parentheses are presentation, a leading "+" is the international marker,
 * and a leading "00" is the other way people write one. All of them are
 * stripped before the number is checked. Empty input means "no WhatsApp" and
 * becomes null, which is a valid save — it is how the button is hidden.
 *
 * A country code never starts with 0, so a leading 0 after the international
 * prefix has been removed is reported separately: the message can then say
 * what to do ("start with the country code") instead of only "invalid".
 */
export type NormalizeWhatsappResult =
  | { ok: true; value: string | null }
  | { ok: false; reason: 'invalid' | 'leading_zero' };

export function normalizeWhatsappNumber(
  input: string
): NormalizeWhatsappResult {
  let value = input.trim().replace(/[\s\-.()]/g, '');

  // One leading "+", then one leading "00": never both, and never repeatedly.
  // "++20..." therefore keeps a "+" and fails the digits-only check below.
  if (value.startsWith('+')) {
    value = value.slice(1);
  }
  if (value.startsWith('00')) {
    value = value.slice(2);
  }

  if (value === '') {
    return { ok: true, value: null };
  }
  if (!/^\d+$/.test(value)) {
    return { ok: false, reason: 'invalid' };
  }
  if (value.startsWith('0')) {
    return { ok: false, reason: 'leading_zero' };
  }
  // E.164: at most 15 digits, and no real country code plus subscriber number
  // is shorter than 8. The upper bound is the standard; the lower one keeps
  // an obvious fragment from becoming a link.
  if (value.length < 8 || value.length > 15) {
    return { ok: false, reason: 'invalid' };
  }

  return { ok: true, value };
}
