import { describe, expect, it } from 'vitest';
import {
  buildDirectionsUrl,
  buildMapEmbedUrl,
  buildOpenMapUrl,
  formatCoordinate,
  resolveCoordinates,
  resolveMapLinks,
  sanitizeMapsUrl,
} from './location';

const MAPS_URL = 'https://maps.google.com/?q=30.0444,31.2357';

describe('formatCoordinate', () => {
  it('keeps up to six decimals and drops trailing zeros', () => {
    expect(formatCoordinate(30.0444)).toBe('30.0444');
    expect(formatCoordinate(31.2357)).toBe('31.2357');
    expect(formatCoordinate(31)).toBe('31');
    expect(formatCoordinate(0)).toBe('0');
  });

  it('rounds many decimals instead of printing an exponent', () => {
    expect(formatCoordinate(30.123456789)).toBe('30.123457');
    expect(formatCoordinate(-33.8688123)).toBe('-33.868812');
    expect(formatCoordinate(0.0000001)).toBe('0');
    expect(formatCoordinate(-0.0000001)).toBe('0');
    expect(formatCoordinate(1e-7)).not.toContain('e');
  });

  it('handles the coordinate boundaries', () => {
    expect(formatCoordinate(90)).toBe('90');
    expect(formatCoordinate(-90)).toBe('-90');
    expect(formatCoordinate(180)).toBe('180');
    expect(formatCoordinate(-180)).toBe('-180');
  });
});

describe('buildMapEmbedUrl', () => {
  it('builds the exact embed URL with the locale', () => {
    expect(buildMapEmbedUrl(30.0444, 31.2357, 'en')).toBe(
      'https://www.google.com/maps?q=30.0444,31.2357&z=15&hl=en&output=embed'
    );
    expect(buildMapEmbedUrl(30.0444, 31.2357, 'ar')).toBe(
      'https://www.google.com/maps?q=30.0444,31.2357&z=15&hl=ar&output=embed'
    );
  });

  it('keeps negative coordinates and rounds long ones', () => {
    expect(buildMapEmbedUrl(-33.8688123, 151.2093, 'en')).toBe(
      'https://www.google.com/maps?q=-33.868812,151.2093&z=15&hl=en&output=embed'
    );
  });
});

describe('buildDirectionsUrl / buildOpenMapUrl', () => {
  it('builds the coordinate-based directions URL', () => {
    expect(buildDirectionsUrl(30.0444, 31.2357)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357'
    );
  });

  it('builds the coordinate-based search URL', () => {
    expect(buildOpenMapUrl(30.0444, 31.2357)).toBe(
      'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357'
    );
  });
});

describe('resolveCoordinates', () => {
  it('accepts a finite in-range pair', () => {
    expect(resolveCoordinates(30.0444, 31.2357)).toEqual({
      lat: 30.0444,
      lng: 31.2357,
    });
    expect(resolveCoordinates(-90, -180)).toEqual({ lat: -90, lng: -180 });
  });

  it('rejects a missing, non-finite or out-of-range pair', () => {
    expect(resolveCoordinates(null, 31)).toBeNull();
    expect(resolveCoordinates(30, null)).toBeNull();
    expect(resolveCoordinates(Number.NaN, 31)).toBeNull();
    expect(resolveCoordinates(30, Number.POSITIVE_INFINITY)).toBeNull();
    expect(resolveCoordinates(91, 31)).toBeNull();
    expect(resolveCoordinates(30, 181)).toBeNull();
    expect(resolveCoordinates(30, -181)).toBeNull();
  });
});

describe('sanitizeMapsUrl', () => {
  it('keeps an absolute https URL and trims it', () => {
    expect(sanitizeMapsUrl(`  ${MAPS_URL}  `)).toBe(MAPS_URL);
    expect(sanitizeMapsUrl('https://example.com/place')).toBe(
      'https://example.com/place'
    );
  });

  it('ignores http, other schemes, relative paths and blanks', () => {
    expect(sanitizeMapsUrl('http://maps.google.com/?q=30,31')).toBeNull();
    expect(sanitizeMapsUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeMapsUrl('data:text/html,hello')).toBeNull();
    expect(sanitizeMapsUrl('/maps/place')).toBeNull();
    expect(sanitizeMapsUrl('maps.google.com')).toBeNull();
    expect(sanitizeMapsUrl('   ')).toBeNull();
    expect(sanitizeMapsUrl(null)).toBeNull();
    expect(sanitizeMapsUrl(undefined)).toBeNull();
  });
});

describe('resolveMapLinks', () => {
  it('uses coordinates for directions and the stored link for open', () => {
    expect(
      resolveMapLinks({
        latitude: 30.0444,
        longitude: 31.2357,
        mapsUrl: MAPS_URL,
      })
    ).toEqual({
      directionsHref:
        'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357',
      openHref: MAPS_URL,
    });
  });

  it('falls back to the coordinate search when there is no stored link', () => {
    expect(
      resolveMapLinks({
        latitude: 30.0444,
        longitude: 31.2357,
        mapsUrl: null,
      })
    ).toEqual({
      directionsHref:
        'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357',
      openHref:
        'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357',
    });
  });

  it('ignores http and invalid stored links', () => {
    for (const mapsUrl of [
      'http://maps.google.com/?q=30.0444,31.2357',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(
        resolveMapLinks({ latitude: 30.0444, longitude: 31.2357, mapsUrl })
          .openHref
      ).toBe('https://www.google.com/maps/search/?api=1&query=30.0444,31.2357');
    }
  });

  it('shows only open when there is a stored link but no coordinates', () => {
    expect(
      resolveMapLinks({ latitude: null, longitude: null, mapsUrl: MAPS_URL })
    ).toEqual({ directionsHref: null, openHref: MAPS_URL });
  });

  it('returns nothing when neither coordinates nor a stored link exist', () => {
    expect(
      resolveMapLinks({ latitude: null, longitude: null, mapsUrl: null })
    ).toEqual({ directionsHref: null, openHref: null });
    expect(
      resolveMapLinks({
        latitude: 91,
        longitude: 31,
        mapsUrl: 'http://maps.google.com',
      })
    ).toEqual({ directionsHref: null, openHref: null });
  });

  it('ignores a lone coordinate and an invalid pair', () => {
    expect(
      resolveMapLinks({ latitude: 30.0444, longitude: null, mapsUrl: null })
    ).toEqual({ directionsHref: null, openHref: null });
    expect(
      resolveMapLinks({ latitude: 30.0444, longitude: 181, mapsUrl: MAPS_URL })
    ).toEqual({ directionsHref: null, openHref: MAPS_URL });
  });
});
