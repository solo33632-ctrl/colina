// Theme preference for the admin panel.
//
// Three choices are exposed — light, dark and system — but only the two
// explicit ones are stored. "System" is represented by the *absence* of the
// cookie, which is also what lets pure CSS follow the OS live: no cookie means
// no `data-theme` attribute, and the media query in `globals.css` takes over.
//
// The cookie is intentionally readable by JavaScript (not httpOnly): the
// toggle writes it client-side so switching is instant, without a round trip.
// The root layout only reads it to put `data-theme` on <html> in the very
// first server-rendered byte, so an explicit dark choice never flashes light.

export const THEME_COOKIE = 'admin-theme';

/** One year, in seconds. */
export const THEME_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export const ADMIN_THEMES = ['light', 'dark', 'system'] as const;
export type AdminTheme = (typeof ADMIN_THEMES)[number];

/** Anything other than a stored explicit choice means "follow the system". */
export function parseTheme(value: string | null | undefined): AdminTheme {
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** `system` is stored as "no cookie", so it serializes to `null`. */
export function serializeTheme(theme: AdminTheme): 'light' | 'dark' | null {
  return theme === 'system' ? null : theme;
}

/**
 * The `data-theme` value for <html>, or `undefined` when the OS should decide.
 * React omits the attribute entirely for `undefined`.
 */
export function themeAttribute(
  theme: AdminTheme
): 'light' | 'dark' | undefined {
  return theme === 'system' ? undefined : theme;
}

/**
 * The cookie assignment the client toggle writes. `Secure` is production-only
 * because the local dev server is plain HTTP; the cookie lifetime, path and
 * SameSite policy are the same in both environments.
 */
export function themeCookie(theme: AdminTheme, secure: boolean): string {
  const value = serializeTheme(theme);
  const suffix = `Path=/; SameSite=Lax${secure ? '; Secure' : ''}`;
  if (value === null) {
    return `${THEME_COOKIE}=; Max-Age=0; ${suffix}`;
  }
  return `${THEME_COOKIE}=${value}; Max-Age=${THEME_COOKIE_MAX_AGE}; ${suffix}`;
}
