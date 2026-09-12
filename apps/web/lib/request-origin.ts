// Same-origin check for public form POSTs: basic CSRF mitigation where
// no session/cookie-based token scheme applies (the public site has no
// authenticated session yet). Browsers always send `Origin` on a POST;
// a present-but-foreign origin means a third-party page is posting at us.
export function isSameOrigin(req: Request): boolean {
  const expected = process.env.NEXT_PUBLIC_WEB_URL;
  if (!expected) {
    // Dev without the env var: cannot validate, warn loudly instead of
    // silently blocking every submission (production always sets it).
    console.warn(
      '[origin-check] NEXT_PUBLIC_WEB_URL is not set — skipping origin check.'
    );
    return true;
  }

  const origin = req.headers.get('origin');
  if (!origin) {
    return false;
  }

  try {
    return new URL(origin).origin === new URL(expected).origin;
  } catch {
    return false;
  }
}
