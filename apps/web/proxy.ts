import createMiddleware from 'next-intl/middleware';
import { routing } from './i18n/routing';

// `proxy.ts` is the Next 16 name for what used to be `middleware.ts`.
export default createMiddleware(routing);

export const config = {
  // Match all pathnames except API routes, Next internals and files
  // with an extension (e.g. `favicon.ico`).
  matcher: '/((?!api|trpc|_next|_vercel|.*\\..*).*)',
};
