import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// Canonical base URL for sitemaps, canonical tags and structured data.
// NEXT_PUBLIC_WEB_URL is the documented production domain (see
// .env.example); the example.com fallback only ever fires in environments
// where it was never set (local builds) and must be replaced in Phase 16.
export function getBaseUrl(): string {
  return process.env.NEXT_PUBLIC_WEB_URL ?? 'https://www.example.com';
}

type Locale = (typeof routing.locales)[number];

// next-intl's documented hreflang pattern: canonical + per-locale
// alternates built with getPathname (locale-aware, prefix-correct),
// plus x-default pointing at the default-locale version. next-intl's
// proxy ALSO emits these as Link response headers; tags and headers
// agree by construction since both derive from the same routing config.
export async function localeAlternates(href: string, locale: Locale) {
  const languages: Record<string, string> = {};
  for (const alternate of routing.locales) {
    languages[alternate] =
      getBaseUrl() + (await getPathname({ locale: alternate, href }));
  }
  languages['x-default'] =
    getBaseUrl() + (await getPathname({ locale: routing.defaultLocale, href }));
  return {
    canonical: getBaseUrl() + (await getPathname({ locale, href })),
    languages,
  };
}

// JSON-LD serializer that neutralizes `</script>` breakouts from
// admin-entered content (names/descriptions flow into structured data).
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/<\//g, '<\\/');
}

// Resolve a stored image path to the absolute URL schema.org expects:
// remote URLs pass through, root-relative seed paths resolve against
// the canonical base.
export function absoluteImageUrl(path: string | null): string | undefined {
  if (!path) {
    return undefined;
  }
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  return `${getBaseUrl()}${path.startsWith('/') ? path : `/${path}`}`;
}
