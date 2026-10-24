/**
 * Parses what an admin pastes into the single "Map coordinates" field.
 *
 * Two things are accepted:
 *
 * 1. A coordinate pair: `30.0444, 31.2357`, `30.0444 31.2357`,
 *    `30.0444,31.2357`, optionally wrapped in parentheses.
 * 2. A long Google Maps URL that carries the point either in its `@lat,lng`
 *    viewport segment or in its `!3d<lat>!4d<lng>` place segment. The place
 *    segment wins when both are present: `@` is where the map was looking,
 *    `!3d/!4d` is the place itself.
 *
 * A short share link (`maps.app.goo.gl`, `goo.gl/maps`) contains no
 * coordinates at all — it is a redirect — so it is rejected with a message
 * telling the owner to copy the numbers instead. Every other unrecognized
 * string is rejected the same way.
 *
 * Validation is deliberately numeric, not textual: `+`, exponents and
 * Arabic-Indic digits never reach `Number`. Latitude/longitude ranges are
 * checked before anything is returned, and the result is rounded to six
 * decimals (about 10 cm), which is far beyond what a factory pin needs and
 * keeps the stored pair stable.
 */
export type Coordinates = {
  lat: number;
  lng: number;
};

export type ParseCoordinatesResult =
  | { ok: true; value: Coordinates | null }
  | { ok: false; reason: 'unrecognized' | 'out_of_range' };

// One finite decimal number, with an optional sign. `\d` is ASCII-only in
// JavaScript, so Arabic-Indic digits are rejected by construction.
const NUMBER = String.raw`[+-]?(?:\d+(?:\.\d*)?|\.\d+)`;
const PAIR = new RegExp(`^(${NUMBER})\\s*(?:,\\s*|\\s+)(${NUMBER})$`);

// Google serves Maps from `google.<tld>` and from `google.<sld>.<tld>`
// (google.co.uk, google.com.eg). `www.` and `maps.` are the two common
// subdomains. This is only a sanity check on pasted text — the URL is never
// fetched — but it keeps a random link with `@lat,lng` from being treated as
// a Google Maps link.
const GOOGLE_HOST =
  /^(?:www\.|maps\.)?google\.(?:com|[a-z]{2,3})(?:\.[a-z]{2})?$/i;

const SHORT_LINK_HOSTS = new Set(['maps.app.goo.gl', 'goo.gl']);

const PLACE_PAIR = new RegExp(`!3d(${NUMBER})!4d(${NUMBER})`);
const VIEW_PAIR = new RegExp(`@(${NUMBER}),(${NUMBER})`);

function round6(value: number): number {
  const rounded = Math.round(value * 1e6) / 1e6;
  // `Math.round(-0.0000001 * 1e6) / 1e6` is `-0`; store a plain 0.
  return Object.is(rounded, -0) ? 0 : rounded;
}

function fromPair(latText: string, lngText: string): ParseCoordinatesResult {
  const lat = Number(latText);
  const lng = Number(lngText);

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: 'unrecognized' };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: 'out_of_range' };
  }

  return { ok: true, value: { lat: round6(lat), lng: round6(lng) } };
}

function stripOuterParentheses(value: string): string {
  if (value.startsWith('(') && value.endsWith(')')) {
    return value.slice(1, -1).trim();
  }
  return value;
}

/**
 * The display form of a saved pair, e.g. `30.0444, 31.2357`.
 *
 * Used by the settings page to seed the edit field, so the value an admin
 * sees is the value `parseCoordinates` reads back unchanged.
 */
export function formatCoordinates(value: Coordinates): string {
  return `${value.lat}, ${value.lng}`;
}

export function parseCoordinates(input: string): ParseCoordinatesResult {
  const raw = input.trim();
  if (raw === '') {
    return { ok: true, value: null };
  }

  const pair = PAIR.exec(stripOuterParentheses(raw));
  if (pair) {
    return fromPair(pair[1], pair[2]);
  }

  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'unrecognized' };
  }

  if (url.protocol !== 'https:' && url.protocol !== 'http:') {
    return { ok: false, reason: 'unrecognized' };
  }
  if (SHORT_LINK_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: 'unrecognized' };
  }
  if (!GOOGLE_HOST.test(url.hostname)) {
    return { ok: false, reason: 'unrecognized' };
  }

  const match = PLACE_PAIR.exec(raw) ?? VIEW_PAIR.exec(raw);
  if (!match) {
    return { ok: false, reason: 'unrecognized' };
  }

  return fromPair(match[1], match[2]);
}
