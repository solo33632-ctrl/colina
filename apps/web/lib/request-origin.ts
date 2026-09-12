// Same-origin check for public form POSTs: basic CSRF mitigation where
// no session/cookie-based token scheme applies (the public site has no
// authenticated session yet). Browsers always send `Origin` on a POST;
// a present-but-foreign origin means a third-party page is posting at us.
export function isSameOrigin(req: Request): boolean {
  const expected = process.env.NEXT_PUBLIC_WEB_URL;
  if (!expected) {
    // Fail closed in production (a misconfigured deploy must refuse form
    // submissions, not silently disable the check); fail open with a loud
    // warning only in non-production development.
    if (process.env.NODE_ENV === 'production') {
      console.error(
        '[origin-check] NEXT_PUBLIC_WEB_URL is not set — refusing request.'
      );
      return false;
    }
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
