import { assert, describe, expect, it } from 'vitest';
import {
  formatCoordinates,
  parseCoordinates,
  type ParseCoordinatesResult,
} from './coordinates';
import { siteSettingsInputSchema } from './schemas';

// Short fixed messages: these tests pin the RULES and which message wins, not
// the copy (the message files have their own parity test).
const M = {
  whatsappNumber: 'format',
  whatsappNumberLeadingZero: 'leading-zero',
  whatsappMessageEn: 'message-en',
  whatsappMessageAr: 'message-ar',
  coordinates: 'coordinates',
  coordinatesRange: 'coordinates-range',
  factoryAddressEn: 'address-en',
  factoryAddressAr: 'address-ar',
  workingHoursEn: 'hours-en',
  workingHoursAr: 'hours-ar',
  mapsUrl: 'maps-url',
  mapsUrlLength: 'maps-url-length',
};

const pair = (lat: number, lng: number): ParseCoordinatesResult => ({
  ok: true,
  value: { lat, lng },
});
const unrecognized: ParseCoordinatesResult = {
  ok: false,
  reason: 'unrecognized',
};
const outOfRange: ParseCoordinatesResult = {
  ok: false,
  reason: 'out_of_range',
};

describe('parseCoordinates', () => {
  it.each([
    ['30.0444, 31.2357', pair(30.0444, 31.2357)],
    ['30.0444 31.2357', pair(30.0444, 31.2357)],
    ['30.0444,31.2357', pair(30.0444, 31.2357)],
    ['(30.0444, 31.2357)', pair(30.0444, 31.2357)],
    ['  ( 30.0444 , 31.2357 )  ', pair(30.0444, 31.2357)],
    ['-33.8688, 151.2093', pair(-33.8688, 151.2093)],
    ['0, 0', pair(0, 0)],
    // A long Maps URL: the `@` viewport segment.
    [
      'https://www.google.com/maps/place/Colina/@30.0444,31.2357,17z/data=!4m2!3m1',
      pair(30.0444, 31.2357),
    ],
    // The `!3d/!4d` place segment.
    [
      'https://www.google.com/maps/place/Colina/data=!4m2!3m1!1s0x0:0x0!8m2!3d30.0444!4d31.2357',
      pair(30.0444, 31.2357),
    ],
    [
      'https://maps.google.com/?ll=@-33.8688,151.2093&z=12',
      pair(-33.8688, 151.2093),
    ],
    // The place pin wins over the viewport centre when both are present.
    [
      'https://www.google.com/maps/@10,20,10z/place/x/data=!3d30.0444!4d31.2357',
      pair(30.0444, 31.2357),
    ],
    // Blank means "no map", which is a valid save.
    ['', { ok: true, value: null }],
    ['   ', { ok: true, value: null }],
  ])('%j -> %j', (input, expected) => {
    expect(parseCoordinates(input)).toEqual(expected);
  });

  it('rounds the stored pair to six decimals and never returns -0', () => {
    expect(parseCoordinates('30.04444444, 31.23555555')).toEqual(
      pair(30.044444, 31.235556)
    );
    expect(parseCoordinates('-0.0000001, 0.0000001')).toEqual(pair(0, 0));
  });

  it.each([
    ['91, 31', outOfRange],
    ['-91, 31', outOfRange],
    ['30, 181', outOfRange],
    ['30, -181', outOfRange],
    ['abc', unrecognized],
    ['30.0444', unrecognized],
    ['30.0444, 31.2357 extra', unrecognized],
    // A short share link is a redirect: there are no numbers in it.
    ['https://maps.app.goo.gl/abc123', unrecognized],
    ['https://goo.gl/maps/abc123', unrecognized],
    // Arabic-Indic digits never reach Number.
    ['٣٠.٠٤٤٤, ٣١.٢٣٥٧', unrecognized],
    // A non-Google URL with @lat,lng is not a Google Maps link.
    ['https://example.com/@30.0444,31.2357', unrecognized],
    ['javascript:alert(1)', unrecognized],
  ])('%j -> %j', (input, expected) => {
    expect(parseCoordinates(input)).toEqual(expected);
  });
});

describe('formatCoordinates', () => {
  it('renders the pair the edit field reads back unchanged', () => {
    const formatted = formatCoordinates({ lat: 30.0444, lng: 31.2357 });
    expect(formatted).toBe('30.0444, 31.2357');
    expect(parseCoordinates(formatted)).toEqual(pair(30.0444, 31.2357));
  });
});

describe('siteSettingsInputSchema factory location', () => {
  const schema = siteSettingsInputSchema(M);

  it('turns one pasted pair into latitude/longitude numbers', () => {
    const parsed = schema.safeParse({ coordinates: '(30.0444, 31.2357)' });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.coordinates).toEqual({ lat: 30.0444, lng: 31.2357 });
  });

  it('accepts a long Google Maps URL and stores the numbers', () => {
    const parsed = schema.safeParse({
      coordinates:
        'https://www.google.com/maps/place/Colina/@30.0444,31.2357,17z/',
    });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.coordinates).toEqual({ lat: 30.0444, lng: 31.2357 });
  });

  it('turns blank or omitted coordinates into null', () => {
    for (const input of [
      { coordinates: '' },
      { coordinates: '   ' },
      { coordinates: null },
      {},
    ]) {
      const parsed = schema.safeParse(input);
      expect(parsed.success, JSON.stringify(input)).toBe(true);
      assert(parsed.success);
      expect(parsed.data.coordinates).toBeNull();
    }
  });

  it('uses the unrecognized message for a short link or junk', () => {
    for (const coordinates of [
      'abc',
      '30.0444',
      'https://maps.app.goo.gl/abc123',
    ]) {
      const parsed = schema.safeParse({ coordinates });
      expect(parsed.success, coordinates).toBe(false);
      assert(!parsed.success);
      const issue = parsed.error.issues.find(
        (candidate) => candidate.path.join('.') === 'coordinates'
      );
      expect(issue?.message, coordinates).toBe(M.coordinates);
    }
  });

  it('uses the range message for out-of-range numbers', () => {
    for (const coordinates of ['91, 31', '30, 181']) {
      const parsed = schema.safeParse({ coordinates });
      expect(parsed.success, coordinates).toBe(false);
      assert(!parsed.success);
      const issue = parsed.error.issues.find(
        (candidate) => candidate.path.join('.') === 'coordinates'
      );
      expect(issue?.message, coordinates).toBe(M.coordinatesRange);
    }
  });

  it('trims optional text and turns blank into null', () => {
    const parsed = schema.safeParse({
      factoryAddressEn: '  12 Industrial Road, Cairo  ',
      factoryAddressAr: '  شارع المصنع، القاهرة  ',
      workingHoursEn: '  Sun–Thu, 9:00–17:00  ',
      workingHoursAr: '  من الأحد إلى الخميس  ',
      mapsUrl: '  https://maps.google.com/?q=30.0444,31.2357  ',
    });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.factoryAddressEn).toBe('12 Industrial Road, Cairo');
    expect(parsed.data.factoryAddressAr).toBe('شارع المصنع، القاهرة');
    expect(parsed.data.workingHoursEn).toBe('Sun–Thu, 9:00–17:00');
    expect(parsed.data.workingHoursAr).toBe('من الأحد إلى الخميس');
    expect(parsed.data.mapsUrl).toBe(
      'https://maps.google.com/?q=30.0444,31.2357'
    );

    const blank = schema.safeParse({
      factoryAddressEn: '   ',
      factoryAddressAr: '',
      workingHoursEn: ' ',
      workingHoursAr: '',
      mapsUrl: '   ',
    });
    expect(blank.success).toBe(true);
    assert(blank.success);
    expect(blank.data.factoryAddressEn).toBeNull();
    expect(blank.data.factoryAddressAr).toBeNull();
    expect(blank.data.workingHoursEn).toBeNull();
    expect(blank.data.workingHoursAr).toBeNull();
    expect(blank.data.mapsUrl).toBeNull();
  });

  it('caps addresses at 300 and working hours at 200 characters', () => {
    expect(
      schema.safeParse({ factoryAddressEn: 'x'.repeat(300) }).success
    ).toBe(true);
    expect(
      schema.safeParse({ factoryAddressEn: 'x'.repeat(301) }).success
    ).toBe(false);
    expect(
      schema.safeParse({ factoryAddressAr: 'ي'.repeat(300) }).success
    ).toBe(true);
    expect(
      schema.safeParse({ factoryAddressAr: 'ي'.repeat(301) }).success
    ).toBe(false);
    expect(schema.safeParse({ workingHoursEn: 'x'.repeat(200) }).success).toBe(
      true
    );
    expect(schema.safeParse({ workingHoursEn: 'x'.repeat(201) }).success).toBe(
      false
    );
    expect(schema.safeParse({ workingHoursAr: 'ي'.repeat(200) }).success).toBe(
      true
    );
    expect(schema.safeParse({ workingHoursAr: 'ي'.repeat(201) }).success).toBe(
      false
    );
  });

  it('accepts only an absolute https maps URL', () => {
    const valid = 'https://maps.google.com/?q=30.0444,31.2357';
    const parsed = schema.safeParse({ mapsUrl: valid });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.mapsUrl).toBe(valid);

    for (const mapsUrl of [
      'http://maps.google.com/?q=30.0444,31.2357',
      'javascript:alert(1)',
      'data:text/html,hello',
      '/maps/place',
      'maps.google.com',
    ]) {
      const invalid = schema.safeParse({ mapsUrl });
      expect(invalid.success, mapsUrl).toBe(false);
      assert(!invalid.success);
      const issue = invalid.error.issues.find(
        (candidate) => candidate.path.join('.') === 'mapsUrl'
      );
      expect(issue?.message, mapsUrl).toBe(M.mapsUrl);
    }
  });

  it('caps the maps URL at 500 characters', () => {
    const prefix = 'https://maps.google.com/?q=';
    expect(
      schema.safeParse({ mapsUrl: prefix + 'a'.repeat(500 - prefix.length) })
        .success
    ).toBe(true);
    expect(
      schema.safeParse({ mapsUrl: prefix + 'a'.repeat(501 - prefix.length) })
        .success
    ).toBe(false);
  });
});
