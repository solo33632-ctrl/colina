// Render-time Cloudinary delivery helpers (Stage 28c).
//
// Every stored URL is left exactly as the database holds it. These helpers
// only build the URLs handed to the browser, so switching delivery settings
// later never needs a data migration. The one exception is the upload action,
// which asks Cloudinary itself to cap the stored asset.
//
// Only the exact shape Cloudinary's own SDK returns is eligible:
//
//   https://res.cloudinary.com/<cloud>/image/upload/<rest>
//
// Anything else — other hosts, plain http, /raw/ or /video/ resources,
// malformed input, SVG/PDF files — comes back untouched. That keeps the
// transformation deterministic for the one provider this project uses and
// stops a lookalike URL from being rewritten into something that 404s.

const CLOUDINARY_PREFIX = 'https://res.cloudinary.com/';
const IMAGE_UPLOAD_PATH = 'image/upload/';

/** Widths offered in the responsive `srcset`, smallest first. */
export const CLOUDINARY_SRCSET_WIDTHS = [400, 800, 1200, 1600, 2000] as const;

/** The default `src` for an inline photo, before the browser picks a srcset entry. */
export const CLOUDINARY_DEFAULT_WIDTH = 1200;

/** The largest derivative: the lightbox and the magnifier use this one. */
export const CLOUDINARY_MAX_WIDTH = 2000;

/** A Cloudinary version segment, e.g. `v1712345678`. */
const VERSION_SEGMENT = /^v\d+$/;

/**
 * Cloudinary transformation parameter names (the part before the first `_`).
 *
 * Used to tell an existing transformation segment from a public id. A public
 * id can itself contain underscores, so “has an underscore” would leave many
 * photos untransformed; matching released parameter names is narrower. A
 * miss is conservative: the URL is returned unchanged rather than rewritten
 * into a broken path.
 */
const TRANSFORMATION_PARAMETERS = new Set([
  'a',
  'ac',
  'af',
  'ar',
  'b',
  'bo',
  'br',
  'c',
  'cs',
  'd',
  'dl',
  'dn',
  'dr',
  'ds',
  'du',
  'dx',
  'dy',
  'e',
  'eo',
  'f',
  'fl',
  'fn',
  'fp',
  'fps',
  'g',
  'h',
  'if',
  'ih',
  'iw',
  'ki',
  'l',
  'o',
  'oh',
  'ow',
  'p',
  'pg',
  'ps',
  'q',
  'r',
  'ra',
  'sh',
  'si',
  'sm',
  'so',
  'sp',
  'sw',
  't',
  'tr',
  'u',
  'ul',
  'vc',
  'vm',
  'vs',
  'w',
  'wa',
  'wal',
  'wb',
  'wc',
  'wp',
  'x',
  'y',
  'z',
]);

type CloudinaryParts = {
  /** Everything up to and including `/image/upload/`. */
  base: string;
  /** The path after `/upload/`, without a query string or fragment. */
  path: string;
  /** The query string and/or fragment, preserved verbatim. */
  suffix: string;
};

/**
 * Splits an eligible Cloudinary image URL into the pieces the transformation
 * is inserted between, or returns null when the URL is not that exact shape.
 *
 * A string split rather than `new URL()` on purpose: WHATWG URL parsing
 * lowercases the host and normalizes the path, so an uppercase host would be
 * silently accepted instead of passing through unchanged, and encoded public
 * ids could be re-encoded.
 */
function cloudinaryParts(src: string): CloudinaryParts | null {
  if (typeof src !== 'string' || !src.startsWith(CLOUDINARY_PREFIX)) {
    return null;
  }

  const afterHost = src.slice(CLOUDINARY_PREFIX.length);
  const cloudEnd = afterHost.indexOf('/');
  if (cloudEnd <= 0) {
    return null;
  }
  const cloud = afterHost.slice(0, cloudEnd);
  // A query or fragment cannot be part of the cloud name; catching it here
  // also rejects e.g. `https://res.cloudinary.com?x=1`.
  if (!cloud || cloud.includes('?') || cloud.includes('#')) {
    return null;
  }

  const path = afterHost.slice(cloudEnd + 1);
  if (!path.startsWith(IMAGE_UPLOAD_PATH)) {
    return null;
  }

  const rest = path.slice(IMAGE_UPLOAD_PATH.length);
  const suffixStart = rest.search(/[?#]/);
  const uploadPath = suffixStart === -1 ? rest : rest.slice(0, suffixStart);
  const suffix = suffixStart === -1 ? '' : rest.slice(suffixStart);

  if (!uploadPath) {
    return null;
  }

  return {
    base: `${CLOUDINARY_PREFIX}${cloud}/${IMAGE_UPLOAD_PATH}`,
    path: uploadPath,
    suffix,
  };
}

/** Whether a segment at the start of `/upload/` is already a transformation. */
function isTransformationSegment(segment: string): boolean {
  return segment.split(',').some((part) => {
    const separator = part.indexOf('_');
    return (
      separator > 0 &&
      TRANSFORMATION_PARAMETERS.has(part.slice(0, separator))
    );
  });
}

/**
 * Normalizes the path for the two checks that must happen before deciding
 * whether to insert a transformation. Returns null for malformed paths so the
 * caller can pass the original URL through unchanged.
 */
function pathSegments(parts: CloudinaryParts): string[] | null {
  const segments = parts.path.split('/');
  // Empty segments (double slashes, a trailing slash) are not a media path
  // this project stores; leave them alone rather than “repairing” them.
  if (segments.some((segment) => segment.length === 0)) {
    return null;
  }
  return segments;
}

/** SVG and PDF are deliberately never transformed. */
function isUntransformableFile(segments: string[]): boolean {
  const filename = segments[segments.length - 1].toLowerCase();
  return filename.endsWith('.svg') || filename.endsWith('.pdf');
}

/**
 * True when `src` is a Cloudinary image URL this module is allowed to rewrite:
 * the exact host/path shape, a real path, no existing transformation, and not
 * an SVG or PDF.
 */
export function isCloudinaryDeliveryUrl(src: string): boolean {
  const parts = cloudinaryParts(src);
  if (!parts) {
    return false;
  }
  const segments = pathSegments(parts);
  if (!segments || isUntransformableFile(segments)) {
    return false;
  }
  const first = segments[0];
  if (VERSION_SEGMENT.test(first)) {
    return true;
  }
  return !isTransformationSegment(first);
}

/**
 * Inserts `f_auto,q_auto,c_limit,w_<width>` immediately after `/upload/`.
 *
 * `c_limit` scales down to the given width and preserves the aspect ratio,
 * which is what keeps every piece of natural-size geometry (the magnifier,
 * the letterbox checks) correct whichever srcset candidate the browser picks.
 *
 * Returns `src` unchanged when it is not an eligible Cloudinary image URL.
 */
export function transformCloudinaryImageUrl(src: string, width: number): string {
  if (!Number.isInteger(width) || width <= 0) {
    return src;
  }

  const parts = cloudinaryParts(src);
  if (!parts) {
    return src;
  }
  const segments = pathSegments(parts);
  if (!segments || isUntransformableFile(segments)) {
    return src;
  }

  const first = segments[0];
  if (!VERSION_SEGMENT.test(first) && isTransformationSegment(first)) {
    return src;
  }

  return `${parts.base}f_auto,q_auto,c_limit,w_${width}/${parts.path}${parts.suffix}`;
}

/**
 * Builds the `srcset` value for an eligible URL, one entry per width
 * (`...w_400 400w, ...w_800 800w, ...`).
 *
 * Returns null when the URL is not eligible, so callers can omit the attribute
 * entirely and render exactly as they did before this helper existed.
 */
export function buildCloudinarySrcset(
  src: string,
  widths: readonly number[] = CLOUDINARY_SRCSET_WIDTHS
): string | null {
  if (!isCloudinaryDeliveryUrl(src)) {
    return null;
  }

  const entries = widths
    .filter((width) => Number.isInteger(width) && width > 0)
    .map((width) => `${transformCloudinaryImageUrl(src, width)} ${width}w`);

  return entries.length > 0 ? entries.join(', ') : null;
}
