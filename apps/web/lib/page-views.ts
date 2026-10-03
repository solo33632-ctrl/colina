// Which requests count as a page view (Phase 21b).
//
// Storage lives in `packages/db/page-views.ts`; this file is the apps/web
// policy around it — what counts, and what shape a count is allowed to take.
// Both parts live next to the endpoint that receives the request so the rules
// are readable in one place and unit-testable without a database.
//
// THE FILTER IS A COURTESY, NOT A DEFENCE. It removes the crawlers that
// identify themselves honestly, so search-engine bots and link-preview
// fetchers do not swamp the numbers. It cannot tell a well-behaved crawler
// from a scraper that sends a normal browser User-Agent, and it can be
// defeated by any client that sends a normal User-Agent — including one
// pretending to be a person. The counts are therefore a floor-biased
// approximation of real traffic, not a measurement of it, and nothing here
// should ever be used to reason about an individual visitor (which is also why
// nothing about the visitor is kept).

import { z } from 'zod';
import { routing } from '@/i18n/routing';

/**
 * Well-known crawlers, as lowercase substrings matched against the
 * User-Agent. A substring match rather than exact strings on purpose: these
 * agents ship long version suffixes ("Googlebot/2.1 (+http://...)"), and a
 * prefix match would need maintaining a list that goes stale.
 */
const NAMED_CRAWLER_SUBSTRINGS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebookexternalhit',
  'twitterbot',
] as const;

/**
 * Fallback for the long tail — every other crawler, scraper and monitoring
 * agent that says "bot", "spider" or "crawler" in its own User-Agent. Cheap
 * and broad on purpose; the false-positive risk (a real browser calling itself
 * a crawler) is acceptable for aggregate counts and is noted above as a
 * limitation rather than treated as a solved problem.
 */
const GENERIC_CRAWLER_PATTERN = /bot|spider|crawler/i;

/**
 * Whether this User-Agent should be excluded from the counts.
 *
 * A missing User-Agent counts as a crawler: every real browser sends one, so
 * an absent value is not a person.
 */
export function isCrawlerUserAgent(userAgent: string | null | undefined) {
  const ua = userAgent?.trim().toLowerCase();
  if (!ua) {
    return true;
  }
  return (
    NAMED_CRAWLER_SUBSTRINGS.some((needle) => ua.includes(needle)) ||
    GENERIC_CRAWLER_PATTERN.test(ua)
  );
}

// The public routes, as the pages themselves name them. A code-owned list, not
// free text: the endpoint stores whatever it is handed, so this is what keeps a
// hostile or buggy caller from opening rows for paths that are not pages
// ("/api/contact", "/_next/...", a 4 KB junk string). The empty segment is the
// home page's root path.
const PUBLIC_PATH_SEGMENTS = [
  '',
  'about',
  'categories',
  'contact',
  'machines',
  'partners',
  'privacy',
  'services',
] as const;

// One lowercase slug: the shape every slug in the seed and admin is generated
// in (`kebab-case`). Cheaper to reject anything else than to enumerate slugs.
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Longest path accepted before the shape rules are even consulted. The longest
// real route is a fraction of this; the cap only stops a caller from making the
// server chew through a huge string to reach the same verdict.
const MAX_PATH_LENGTH = 200;

/**
 * The routes a page may report, as a pattern.
 *
 * Exported as a matcher rather than a bare regex so the route list above stays
 * the single place the public site is described, and so the test file can
 * exercise the real rule instead of a copy.
 */
export function isPublicPagePath(path: string): boolean {
  const normalized = path.trim();
  if (normalized !== path || normalized.length > MAX_PATH_LENGTH) {
    // A path with surrounding whitespace is a caller bug, not a route.
    return false;
  }
  if (normalized === '/') {
    return true;
  }
  const segments = normalized.split('/');
  // split('/') on "/about" gives ["", "about"]; anything longer than three
  // parts is deeper than any public route (home, or one segment, or
  // collection + slug).
  if (segments.length < 2 || segments.length > 3 || segments[0] !== '') {
    return false;
  }
  const [collection, slug] = segments.slice(1);
  const known = (PUBLIC_PATH_SEGMENTS as readonly string[]).includes(
    collection
  );
  if (!known) {
    return false;
  }
  // Static pages are the whole path; only the two collections take a slug.
  if (slug === undefined) {
    return true;
  }
  const takesSlug = collection === 'categories' || collection === 'machines';
  return takesSlug && SLUG_PATTERN.test(slug);
}

/**
 * The endpoint's input contract, validated server-side like every other input
 * in this project — the client's payload is untrusted no matter what the page
 * that sent it looks like.
 *
 * `locale` is enumerated from `routing.locales` rather than restated, so
 * adding a language in one place cannot leave this endpoint behind.
 */
export const pageViewInputSchema = z.object({
  path: z.string().max(MAX_PATH_LENGTH).refine(isPublicPagePath),
  locale: z.enum(routing.locales),
});

export type PageViewInput = z.infer<typeof pageViewInputSchema>;
