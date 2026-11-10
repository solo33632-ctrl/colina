// Same-origin check for the admin's public auth POSTs
// (`/api/auth/forgot-password`, `/api/auth/reset-password`).
//
// These endpoints send reset email or rotate credentials and have no
// session/CSRF token of their own, so a cross-site form post must be
// refused. The credential sign-in endpoint is deliberately not routed
// through this helper: Auth.js already requires its own CSRF token for the
// callback POST (the login form obtains it from `/api/auth/csrf`).
//
// Mirrors `apps/web/lib/request-origin.ts` with one admin-specific
// difference: the expected origin comes from the request itself (Host /
// URL) AND `NEXTAUTH_URL`, so a reverse proxy that rewrites the internal
// URL still accepts the public origin. A missing Origin is rejected —
// browsers always send Origin on a POST, and the project's existing rule is
// to refuse non-browser clients rather than guess.
export function isSameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) {
    return false;
  }

  let provided: string;
  try {
    provided = new URL(origin).origin;
  } catch {
    return false;
  }

  return expectedOrigins(req).includes(provided);
}

function expectedOrigins(req: Request): string[] {
  const origins = new Set<string>();

  const requestUrl = safeUrl(req.url);
  if (requestUrl) {
    origins.add(requestUrl.origin);
    // `NEXTAUTH_URL` normally carries the public scheme/host; the Host
    // header is included for deployments served directly on this host.
    const host = req.headers.get('host');
    if (host) {
      origins.add(`${requestUrl.protocol}//${host}`);
    }
  }

  const configured = process.env.NEXTAUTH_URL;
  if (configured) {
    const parsed = safeUrl(configured);
    if (!parsed) {
      console.error(
        '[origin-check] NEXTAUTH_URL is not a valid URL — refusing request.'
      );
      return [];
    }
    origins.add(parsed.origin);
    return [...origins];
  }

  // Same split as apps/web: a production deploy missing its public URL is
  // misconfigured and must refuse these POSTs; development can fall back to
  // the request's own host with a warning.
  if (process.env.NODE_ENV === 'production') {
    console.error(
      '[origin-check] NEXTAUTH_URL is not set — refusing request.'
    );
    return [];
  }

  console.warn(
    '[origin-check] NEXTAUTH_URL is not set — using the request host.'
  );
  return [...origins];
}

function safeUrl(value: string): URL | null {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}
