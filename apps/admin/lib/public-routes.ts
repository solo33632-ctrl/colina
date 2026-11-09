// Routes that must stay reachable without a verified admin session. Shared
// by the proxy (JWT perimeter) and the locale layout (verified-session
// redirect), so the two gates cannot drift.
export const PUBLIC_AUTH_ROUTES = new Set([
  '/login',
  '/forgot-password',
  '/reset-password',
]);

/** `/ar/categories` -> `/categories`; `/en` -> `/`. */
export function routeWithoutLocale(pathname: string): string {
  return `/${pathname.split('/').slice(2).join('/')}`;
}

export function isPublicAuthPath(pathname: string): boolean {
  return PUBLIC_AUTH_ROUTES.has(routeWithoutLocale(pathname));
}
