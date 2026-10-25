/**
 * Google Maps links for the public factory section.
 *
 * Pure functions only: the settings row is untrusted input (it can be old,
 * hand-edited or half-migrated), so every value is validated here before it
 * becomes an href. Nothing in this module talks to Google; the iframe and the
 * links are built from numbers, which is also why the section works without an
 * API key and without client-side JavaScript.
 *
 * Coordinates are printed with at most six decimals (about 10 cm) and never in
 * exponent notation. `Number#toFixed` is safe for the ranges checked below
 * (|lat| <= 90, |lng| <= 180), and stripping the trailing zeros keeps the URLs
 * stable and readable.
 */

export type Coordinates = {
  lat: number;
  lng: number;
};

/** The three stored fields the map links depend on. */
export type MapLinkSettings = {
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
};

export type MapLinks = {
  /** Coordinate-based directions. Null when there is no usable pair. */
  directionsHref: string | null;
  /** Stored maps link when valid, else the coordinate search. */
  openHref: string | null;
};

const MAX_DECIMALS = 6;
const DECIMAL_FACTOR = 10 ** MAX_DECIMALS;

/**
 * A number as a Maps-safe coordinate string: at most six decimals, no
 * exponent, and never `-0`.
 */
export function formatCoordinate(value: number): string {
  const rounded = Math.round(value * DECIMAL_FACTOR) / DECIMAL_FACTOR;
  const plain = Object.is(rounded, -0) ? 0 : rounded;
  return plain.toFixed(MAX_DECIMALS).replace(/\.?0+$/, '');
}

/**
 * The pair, or null. Both numbers must be present, finite and inside the
 * real-world ranges; a lone latitude or a 91 is "no map", not a broken map.
 */
export function resolveCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined
): Coordinates | null {
  if (typeof latitude !== 'number' || typeof longitude !== 'number') {
    return null;
  }
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return null;
  }
  if (latitude < -90 || latitude > 90) {
    return null;
  }
  if (longitude < -180 || longitude > 180) {
    return null;
  }
  return { lat: latitude, lng: longitude };
}

/**
 * The stored Maps link, trimmed, only when it is an absolute https URL.
 * `http:`, `javascript:`, `data:` and relative paths are all ignored.
 */
export function sanitizeMapsUrl(
  value: string | null | undefined
): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol !== 'https:' || url.hostname === '') {
      return null;
    }
    return trimmed;
  } catch {
    return null;
  }
}

export function buildMapEmbedUrl(
  lat: number,
  lng: number,
  locale: 'ar' | 'en'
): string {
  return `https://www.google.com/maps?q=${formatCoordinate(lat)},${formatCoordinate(lng)}&z=15&hl=${locale}&output=embed`;
}

export function buildDirectionsUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${formatCoordinate(lat)},${formatCoordinate(lng)}`;
}

export function buildOpenMapUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${formatCoordinate(lat)},${formatCoordinate(lng)}`;
}

/**
 * The two buttons' destinations.
 *
 * Directions always uses the coordinates: it is a route to the pin, and a
 * stored share link may point at a place page rather than a drivable target.
 * "Open in Google Maps" prefers the admin's stored link (it may be a richer
 * place page) and falls back to a coordinate search. With no coordinates the
 * directions button disappears; a valid stored link still opens the map.
 */
export function resolveMapLinks(settings: MapLinkSettings): MapLinks {
  const coordinates = resolveCoordinates(settings.latitude, settings.longitude);
  const mapsUrl = sanitizeMapsUrl(settings.mapsUrl);

  return {
    directionsHref: coordinates
      ? buildDirectionsUrl(coordinates.lat, coordinates.lng)
      : null,
    openHref:
      mapsUrl ??
      (coordinates ? buildOpenMapUrl(coordinates.lat, coordinates.lng) : null),
  };
}
