import { assert, describe, expect, it } from 'vitest';
import { siteSettingsInputSchema } from './schemas';
import { normalizeWhatsappNumber } from './whatsapp';

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

describe('normalizeWhatsappNumber', () => {
  it.each([
    // Accepted forms: spaces, hyphens, dots, parentheses, "+" and "00".
    ['+20 100 123 4567', { ok: true, value: '201001234567' }],
    ['0020 100-123-4567', { ok: true, value: '201001234567' }],
    ['(20) 1001234567', { ok: true, value: '201001234567' }],
    ['20.100.123.4567', { ok: true, value: '201001234567' }],
    ['+1 202 555 0143', { ok: true, value: '12025550143' }],
    // Empty means "no WhatsApp", which is a valid save.
    ['', { ok: true, value: null }],
    ['   ', { ok: true, value: null }],
    ['+', { ok: true, value: null }],
    // Length bounds: 8 and 15 are valid, 7 and 16 are not.
    ['12345678', { ok: true, value: '12345678' }],
    ['123456789012345', { ok: true, value: '123456789012345' }],
    ['1234567', { ok: false, reason: 'invalid' }],
    ['1234567890123456', { ok: false, reason: 'invalid' }],
    // A country code never starts with 0.
    ['01001234567', { ok: false, reason: 'leading_zero' }],
    ['01234567', { ok: false, reason: 'leading_zero' }],
    ['0', { ok: false, reason: 'leading_zero' }],
    // Anything that is not digits after the international prefix is invalid.
    ['20 100 abc', { ok: false, reason: 'invalid' }],
    ['+20 100 123 456a', { ok: false, reason: 'invalid' }],
    ['++20 100 123 4567', { ok: false, reason: 'invalid' }],
    ['0abc', { ok: false, reason: 'invalid' }],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeWhatsappNumber(input)).toEqual(expected);
  });

  it('strips only one leading "+" and one leading "00"', () => {
    // "+0020..." loses the "+" and then the "00", leaving a valid number.
    expect(normalizeWhatsappNumber('+0020 100 123 4567')).toEqual({
      ok: true,
      value: '201001234567',
    });
    // A second "00" is data, not a prefix, and a leading zero is refused.
    expect(normalizeWhatsappNumber('00020 100 123 4567')).toEqual({
      ok: false,
      reason: 'leading_zero',
    });
  });
});

describe('siteSettingsInputSchema', () => {
  const schema = siteSettingsInputSchema(M);

  it('accepts a full save and returns the normalized number', () => {
    const parsed = schema.safeParse({
      whatsappNumber: '+20 100 123 4567',
      whatsappMessageEn: 'Hello from Colina',
      whatsappMessageAr: 'مرحباً من كولينا',
    });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.whatsappNumber).toBe('201001234567');
    expect(parsed.data.whatsappMessageEn).toBe('Hello from Colina');
    expect(parsed.data.whatsappMessageAr).toBe('مرحباً من كولينا');
  });

  it('turns a blank or omitted number into null', () => {
    for (const input of [
      { whatsappNumber: '' },
      { whatsappNumber: '   ' },
      // What the form's resolver sends after its own transform has run.
      { whatsappNumber: null },
      {},
    ]) {
      const parsed = schema.safeParse(input);
      expect(parsed.success, JSON.stringify(input)).toBe(true);
      assert(parsed.success);
      expect(parsed.data.whatsappNumber).toBeNull();
    }
  });

  it('uses the leading-zero message for a number that starts with 0', () => {
    const parsed = schema.safeParse({ whatsappNumber: '01001234567' });
    expect(parsed.success).toBe(false);
    assert(!parsed.success);
    const issue = parsed.error.issues.find(
      (candidate) => candidate.path.join('.') === 'whatsappNumber'
    );
    expect(issue?.message).toBe(M.whatsappNumberLeadingZero);
  });

  it('uses the format message for other invalid input', () => {
    for (const number of ['20 100 abc', '1234567', '++20 100 123 4567']) {
      const parsed = schema.safeParse({ whatsappNumber: number });
      expect(parsed.success, number).toBe(false);
      assert(!parsed.success);
      const issue = parsed.error.issues.find(
        (candidate) => candidate.path.join('.') === 'whatsappNumber'
      );
      expect(issue?.message, number).toBe(M.whatsappNumber);
    }
  });

  it('caps each greeting at 300 characters and leaves them optional', () => {
    expect(
      schema.safeParse({
        whatsappNumber: '',
        whatsappMessageEn: 'x'.repeat(300),
        whatsappMessageAr: 'ي'.repeat(300),
      }).success
    ).toBe(true);
    expect(
      schema.safeParse({
        whatsappNumber: '',
        whatsappMessageEn: 'x'.repeat(301),
      }).success
    ).toBe(false);
    expect(
      schema.safeParse({
        whatsappNumber: '',
        whatsappMessageAr: 'ي'.repeat(301),
      }).success
    ).toBe(false);
    // Omitted greetings are fine: the form can save only a number, or only one
    // language's greeting.
    expect(schema.safeParse({ whatsappNumber: '' }).success).toBe(true);
  });
});
