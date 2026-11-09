import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';
import { PUBLIC_AUTH_ROUTES, routeWithoutLocale } from './lib/public-routes';

// Next 16 `proxy.ts` (what used to be `middleware.ts`). Next.js allows only
// one proxy file, so this composes the two concerns the admin needs:
//
//   1. next-intl's locale negotiation / prefixing, via `handleI18nRouting`.
//   2. The session gate, which used to be `withAuth` from `next-auth/middleware`.
//
// (1) is next-intl's documented composition shape: build the middleware with
// `createMiddleware`, then wrap it in a function that does work before/after
// calling it.
//
// (2) is no longer `withAuth` because `pages.signIn` there is a single static
// string — it can only ever redirect to one language's `/login`. Reading the
// token directly lets the redirect target the locale the visitor actually
// asked for, which is the whole point of a bilingual admin. `getToken` is
// used instead of `@/lib/auth` because argon2/Prisma are Node-only and this
// file may run on the Edge runtime; it only needs NEXTAUTH_SECRET.
//
// This file must not import anything Node-only (argon2, Prisma, nodemailer).
const handleI18nRouting = createMiddleware(routing);

// Stage 2b: production CSP. Next emits inline bootstrap/flight scripts, so
// `script-src 'self'` alone blocks hydration. A per-request nonce lets
// exactly those scripts run without `'unsafe-inline'` (which production must
// not have). Next reads the policy from the *request* header, extracts the
// nonce and stamps it on every script it emits; the same policy is returned
// as a response header so the browser enforces it. Development keeps the
// static policy in next.config.mjs (React dev mode needs 'unsafe-eval').
const isProduction = process.env.NODE_ENV === 'production';

function productionContentSecurityPolicy(nonce: string): string {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://res.cloudinary.com",
    "font-src 'self' data:",
    "connect-src 'self'",
    "frame-src 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
  ].join('; ');
}

function withProductionCsp<T extends NextResponse>(
  response: T,
  nonce: string | undefined
): T {
  if (nonce) {
    response.headers.set(
      'content-security-policy',
      productionContentSecurityPolicy(nonce)
    );
  }
  return response;
}

// Reachable without a session. Everything else under a locale prefix needs
// one. Note the app's own `requireAdmin()`/`requireSuperAdmin()` still gate
// every page and action — this is the outer perimeter, not the only one.
// The set lives in `lib/public-routes.ts` so the layout's verified-session
// gate uses exactly the same definition.

// `/ar/categories` -> 'ar'; `/categories` -> null. Parsed from the path
// rather than from `handleI18nRouting` so the auth decision can be made
// before any redirect/rewrite happens.
function localeFromPathname(pathname: string) {
  const segment = pathname.split('/')[1] ?? '';
  return hasLocale(routing.locales, segment) ? segment : null;
}

export default async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const locale = localeFromPathname(pathname);

  // One nonce per request. It goes on the request header (Next stamps its
  // inline scripts with it) and on the response (the browser enforces it).
  let nonce: string | undefined;
  if (isProduction) {
    nonce = Buffer.from(crypto.randomUUID()).toString('base64');
    request.headers.set(
      'content-security-policy',
      productionContentSecurityPolicy(nonce)
    );
  }

  // No locale prefix: let next-intl negotiate (cookie, then `accept-language`,
  // then the default) and redirect to the prefixed URL. Re-running the auth
  // check here would be wrong — it would gate a URL that is about to change.
  if (locale === null) {
    return withProductionCsp(handleI18nRouting(request), nonce);
  }

  // The app-level route with the locale prefix stripped.
  const route = routeWithoutLocale(pathname);

  // Downstream server components have no pathname API. The layout needs it
  // to tell the public auth screens from the authenticated ones (and to
  // build the callbackUrl), so carry it on the request headers. next-intl
  // copies the request headers onto the response it returns, so setting it
  // on `request.headers` is enough for both rewrite and next() paths.
  request.headers.set('x-admin-pathname', pathname);

  if (!PUBLIC_AUTH_ROUTES.has(route)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
      // Must match `useSecureCookies` in lib/auth.ts. getToken otherwise
      // infers the cookie name from NEXTAUTH_URL's protocol, so an http URL
      // in production would look for the unprefixed name while the session
      // cookie is actually `__Secure-next-auth.session-token` — an endless
      // login redirect for every signed-in admin.
      secureCookie: process.env.NODE_ENV === 'production',
    });
    if (!token) {
      const url = new URL(`/${locale}/login`, request.url);
      // Preserved so the visitor lands back where they were headed, in the
      // same language, once they sign in.
      url.searchParams.set('callbackUrl', `${pathname}${search}`);
      return withProductionCsp(NextResponse.redirect(url), nonce);
    }
  }

  return withProductionCsp(handleI18nRouting(request), nonce);
}

export const config = {
  // Everything except API routes (which include the NextAuth handlers at
  // `/api/auth/*` — these must stay unprefixed and reachable with no session),
  // Next internals, and files with an extension (e.g. `favicon.ico`).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
