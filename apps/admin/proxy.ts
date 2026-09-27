import { hasLocale } from 'next-intl';
import createMiddleware from 'next-intl/middleware';
import { getToken } from 'next-auth/jwt';
import { NextResponse, type NextRequest } from 'next/server';
import { routing } from './i18n/routing';

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

// Reachable without a session. Everything else under a locale prefix needs
// one. Note the app's own `requireAdmin()`/`requireSuperAdmin()` still gate
// every page and action — this is the outer perimeter, not the only one.
const PUBLIC_ROUTES = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
]);

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

  // No locale prefix: let next-intl negotiate (cookie, then `accept-language`,
  // then the default) and redirect to the prefixed URL. Re-running the auth
  // check here would be wrong — it would gate a URL that is about to change.
  if (locale === null) {
    return handleI18nRouting(request);
  }

  // The app-level route with the locale prefix stripped.
  const route = `/${pathname.split('/').slice(2).join('/')}`;

  if (!PUBLIC_ROUTES.has(route)) {
    const token = await getToken({
      req: request,
      secret: process.env.NEXTAUTH_SECRET,
    });
    if (!token) {
      const url = new URL(`/${locale}/login`, request.url);
      // Preserved so the visitor lands back where they were headed, in the
      // same language, once they sign in.
      url.searchParams.set('callbackUrl', `${pathname}${search}`);
      return NextResponse.redirect(url);
    }
  }

  return handleI18nRouting(request);
}

export const config = {
  // Everything except API routes (which include the NextAuth handlers at
  // `/api/auth/*` — these must stay unprefixed and reachable with no session),
  // Next internals, and files with an extension (e.g. `favicon.ico`).
  matcher: '/((?!api|_next|_vercel|.*\\..*).*)',
};
