import createMiddleware from 'next-intl/middleware';
import type { NextRequest } from 'next/server';
import { e2eDatabaseHeader } from '@colina/db/database-identity';
import { routing } from './i18n/routing';

const handleI18nRouting = createMiddleware(routing);

// `proxy.ts` is the Next 16 name for what used to be `middleware.ts`.
export default function proxy(request: NextRequest) {
  const response = handleI18nRouting(request);

  // Gated test-only proof of the database this server is attached to.
  // Returns null unless E2E_EXPOSE_DB === '1' outside production.
  const databaseHeader = e2eDatabaseHeader(process.env);
  if (databaseHeader) {
    response.headers.set(databaseHeader.name, databaseHeader.value);
  }

  return response;
}

export const config = {
  // Match all pathnames except API routes, Next internals and files
  // with an extension (e.g. `favicon.ico`).
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
