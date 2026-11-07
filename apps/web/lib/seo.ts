import type { Metadata } from 'next';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// Canonical base URL for sitemaps, canonical tags, share images and
// structured data. NEXT_PUBLIC_WEB_URL is the documented production domain
// (see .env.example). A missing or invalid value must never turn into a
// fabricated example.com domain: every absolute URL is omitted instead, and
// the misconfiguration is logged once per process.
let warnedMissingBaseUrl = false;

function normalizeBaseUrl(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return null;
    }
    return url.toString().replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function getBaseUrl(): string | null {
  const base = normalizeBaseUrl(process.env.NEXT_PUBLIC_WEB_URL);
  if (base) {
    // A later valid configuration (tests, preview environments) clears the
    // latch so a subsequent miss can warn again.
    warnedMissingBaseUrl = false;
    return base;
  }
  if (!warnedMissingBaseUrl) {
    warnedMissingBaseUrl = true;
    console.warn(
      '[seo] NEXT_PUBLIC_WEB_URL is missing or invalid; absolute metadata URLs (canonical, hreflang, share images, sitemap) are omitted.'
    );
  }
  return null;
}

// `metadataBase` accepts a URL object; undefined leaves it unset so Next does
// not resolve relative metadata against a guessed request host.
export function getMetadataBase(): URL | undefined {
  const base = getBaseUrl();
  return base ? new URL(base) : undefined;
}

type Locale = (typeof routing.locales)[number];

// next-intl's documented hreflang pattern: canonical + per-locale
// alternates built with getPathname (locale-aware, prefix-correct),
// plus x-default pointing at the default-locale version. next-intl's
// proxy ALSO emits these as Link response headers; tags and headers
// agree by construction since both derive from the same routing config.
// Without a base URL there is nothing valid to emit, so the whole
// `alternates` block is omitted rather than made relative.
export async function localeAlternates(href: string, locale: Locale) {
  const base = getBaseUrl();
  if (!base) return undefined;

  const languages: Record<string, string> = {};
  for (const alternate of routing.locales) {
    languages[alternate] =
      base + (await getPathname({ locale: alternate, href }));
  }
  languages['x-default'] =
    base + (await getPathname({ locale: routing.defaultLocale, href }));
  return {
    canonical: base + (await getPathname({ locale, href })),
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
  const base = getBaseUrl();
  if (!base) {
    return undefined;
  }
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

// The site's default share card, generated once from the existing logo.
export function defaultShareImageUrl(): string | undefined {
  const base = getBaseUrl();
  return base ? `${base}/og-default.png` : undefined;
}

// A machine/category photo may become an OG image only when it is (or, for a
// root-relative path on an https site, resolves to) an https URL. http and
// data: images are deliberately refused; the caller falls back to the
// default share card.
export function shareImageUrl(path: string | null): string | undefined {
  if (!path) return undefined;
  if (/^https:\/\//i.test(path)) return path;
  if (/^(http:\/\/|data:)/i.test(path)) return undefined;
  const base = getBaseUrl();
  if (!base || !base.startsWith('https://')) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

type OpenGraph = NonNullable<Metadata['openGraph']>;
type Twitter = NonNullable<Metadata['twitter']>;

export function openGraphLocale(locale: string): 'ar_AR' | 'en_US' {
  return locale === 'ar' ? 'ar_AR' : 'en_US';
}

// Shared defaults for every page. Title and description are intentionally
// left out: Next inherits the page's own metadata title/description into the
// OpenGraph and Twitter tags, so each page shares its real copy.
export function buildOpenGraph({
  locale,
  siteName,
  imageUrl,
  imageAlt,
  imageWidth,
  imageHeight,
}: {
  locale: string;
  siteName: string;
  imageUrl?: string;
  imageAlt?: string;
  /** Only the generated default card has known dimensions. */
  imageWidth?: number;
  imageHeight?: number;
}): OpenGraph {
  return {
    type: 'website',
    siteName,
    locale: openGraphLocale(locale),
    alternateLocale: [openGraphLocale(locale === 'ar' ? 'en' : 'ar')],
    ...(imageUrl
      ? {
          images: [
            {
              url: imageUrl,
              ...(imageWidth && imageHeight
                ? { width: imageWidth, height: imageHeight }
                : {}),
              alt: imageAlt ?? siteName,
            },
          ],
        }
      : {}),
  };
}

export function buildTwitter(imageUrl?: string): Twitter {
  return {
    card: 'summary_large_image',
    ...(imageUrl ? { images: [imageUrl] } : {}),
  };
}
