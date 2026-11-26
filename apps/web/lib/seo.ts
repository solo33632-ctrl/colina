import type { Metadata } from 'next';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';

// Canonical base URL for sitemaps, canonical tags, share images and
// structured data. NEXT_PUBLIC_WEB_URL is the documented production domain
// (see .env.example).
//
// A missing value is only tolerable while developing: there, localhost is the
// real address the app is served from, so the metadata is still honest. A
// production build has no defensible fallback — publishing a canonical URL of
// localhost would poison every index — so it fails loudly instead of silently
// emitting a fabricated domain.
export const DEVELOPMENT_BASE_URL = 'http://localhost:3000';

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

export function getBaseUrl(): string {
  const base = normalizeBaseUrl(process.env.NEXT_PUBLIC_WEB_URL);
  if (base) {
    // A later valid configuration (tests, preview environments) clears the
    // latch so a subsequent miss can warn again.
    warnedMissingBaseUrl = false;
    return base;
  }

  if (process.env.NODE_ENV !== 'production') {
    if (!warnedMissingBaseUrl) {
      warnedMissingBaseUrl = true;
      console.warn(
        `[seo] NEXT_PUBLIC_WEB_URL is missing or invalid; using ${DEVELOPMENT_BASE_URL} for development only.`
      );
    }
    return DEVELOPMENT_BASE_URL;
  }

  throw new Error(
    '[seo] NEXT_PUBLIC_WEB_URL is required in production. Set it to the public site origin (for example https://www.your-domain.example) before building or serving apps/web.'
  );
}

export function getMetadataBase(): URL {
  return new URL(getBaseUrl());
}

type Locale = (typeof routing.locales)[number];

// next-intl's documented hreflang pattern: canonical + per-locale
// alternates built with getPathname (locale-aware, prefix-correct),
// plus x-default pointing at the default-locale version. next-intl's
// proxy ALSO emits these as Link response headers; tags and headers
// agree by construction since both derive from the same routing config.
export async function localeAlternates(href: string, locale: Locale) {
  const base = getBaseUrl();
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

// Search engines truncate by their own rules; keeping titles around 60 and
// descriptions around 160 characters makes every page's snippet predictable.
// The cut is always on a word boundary and never inside an HTML entity, so a
// real string such as `R&D &amp; more` cannot become `R&D &am…`.
const TRAILING_PUNCTUATION = /[\s,;:.!?،؛…\-–—]+$/u;

function truncateAtWord(value: string, max: number): string {
  const text = value.replace(/\s+/g, ' ').trim();
  const characters = Array.from(text);
  if (characters.length <= max) {
    return text;
  }

  let cut = characters.slice(0, max - 1).join('');

  // If the cut landed inside an entity, back up to its ampersand.
  const ampersand = cut.lastIndexOf('&');
  if (ampersand !== -1 && !cut.slice(ampersand).includes(';')) {
    cut = cut.slice(0, ampersand);
  }

  const lastWordGap = cut.search(/\s+\S*$/u);
  if (lastWordGap > 0) {
    cut = cut.slice(0, lastWordGap);
  }
  cut = cut.replace(TRAILING_PUNCTUATION, '');

  if (cut.length === 0) {
    // One enormous word: still stay inside the budget, even though there is
    // no word boundary to respect.
    return characters.slice(0, max).join('').replace(TRAILING_PUNCTUATION, '');
  }
  return `${cut}…`;
}

export function truncateSeoTitle(value: string): string {
  return truncateAtWord(value, 60);
}

export function truncateSeoDescription(value: string): string {
  return truncateAtWord(value, 160);
}

/**
 * The localized value, falling back to the other locale when the requested
 * one is blank. Admin content is bilingual but not always complete; a page
 * must never lose its title because one language is still being written.
 */
export function localizedValue(
  locale: string,
  ar: string | null | undefined,
  en: string | null | undefined
): string {
  const primary = locale === 'ar' ? ar : en;
  const fallback = locale === 'ar' ? en : ar;
  return primary?.trim() || fallback?.trim() || '';
}

// JSON-LD serializer that neutralizes every character that could end the
// script element or break the surrounding HTML: `<`, `>`, `&` and the two
// JavaScript line separators. JSON.parse sees the original text again because
// these are valid JSON escapes.
export function serializeJsonLd(data: unknown): string {
  return JSON.stringify(data)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
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

// The site's default share card, generated once from the existing logo.
export function defaultShareImageUrl(): string {
  return `${getBaseUrl()}/og-default.png`;
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
  if (!base.startsWith('https://')) return undefined;
  return `${base}${path.startsWith('/') ? path : `/${path}`}`;
}

type OpenGraph = NonNullable<Metadata['openGraph']>;
type Twitter = NonNullable<Metadata['twitter']>;

export function openGraphLocale(locale: string): 'ar_AR' | 'en_US' {
  return locale === 'ar' ? 'ar_AR' : 'en_US';
}

export function buildOpenGraph({
  locale,
  siteName,
  title,
  description,
  url,
  imageUrl,
  imageAlt,
  imageWidth,
  imageHeight,
}: {
  locale: string;
  siteName: string;
  title?: string;
  description?: string;
  url?: string;
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
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(url ? { url } : {}),
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

export function buildTwitter(
  imageUrl?: string,
  title?: string,
  description?: string
): Twitter {
  return {
    card: 'summary_large_image',
    ...(title ? { title } : {}),
    ...(description ? { description } : {}),
    ...(imageUrl ? { images: [imageUrl] } : {}),
  };
}

export type PageShareImage = {
  url: string;
  alt?: string;
  width?: number;
  height?: number;
};

export type PageMetadataInput = {
  locale: Locale;
  href: string;
  title: string;
  description?: string;
  siteName: string;
  image?: PageShareImage;
  robots?: Metadata['robots'];
};

/**
 * The one metadata builder every public page uses. Keeping canonical,
 * hreflang, OpenGraph and Twitter together is what stops one page type from
 * quietly losing an alternate or shipping an untruncated description.
 */
export async function buildPageMetadata(
  input: PageMetadataInput
): Promise<Metadata> {
  const alternates = await localeAlternates(input.href, input.locale);
  const title = truncateSeoTitle(input.title);
  const description = input.description
    ? truncateSeoDescription(input.description)
    : undefined;
  const image = input.image ?? {
    url: defaultShareImageUrl(),
    alt: input.siteName,
    width: 1200,
    height: 630,
  };

  return {
    title,
    ...(description ? { description } : {}),
    alternates,
    ...(input.robots ? { robots: input.robots } : {}),
    openGraph: buildOpenGraph({
      locale: input.locale,
      siteName: input.siteName,
      title,
      description,
      url: alternates.canonical,
      imageUrl: image.url,
      imageAlt: image.alt ?? input.siteName,
      imageWidth: image.width,
      imageHeight: image.height,
    }),
    twitter: buildTwitter(image.url, title, description),
  };
}

export type BreadcrumbJsonLdItem = {
  name: string;
  href: string;
};

/**
 * A localized BreadcrumbList matching the visible trail on the page. Every
 * item is absolute because schema.org consumers do not resolve relative URLs
 * against an unknown host.
 */
export async function buildBreadcrumbList(
  locale: Locale,
  items: BreadcrumbJsonLdItem[]
) {
  const base = getBaseUrl();
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: await Promise.all(
      items.map(async (item, index) => ({
        '@type': 'ListItem',
        position: index + 1,
        name: item.name,
        item: base + (await getPathname({ locale, href: item.href })),
      }))
    ),
  };
}
