import { assert, describe, expect, it } from 'vitest';
import { siteSettingsInputSchema } from './schemas';

// Short fixed messages: these tests pin the RULES and which message wins, not
// the copy (the message files have their own parity test).
const M = {
  whatsappNumber: 'format',
  whatsappNumberLeadingZero: 'leading-zero',
  whatsappMessageEn: 'message-en',
  whatsappMessageAr: 'message-ar',
  contactPhone: 'contact-phone',
  contactPhoneLength: 'contact-phone-length',
  contactEmail: 'contact-email',
  contactEmailLength: 'contact-email-length',
  factoryAddressEn: 'address-en',
  factoryAddressAr: 'address-ar',
  workingHoursEn: 'hours-en',
  workingHoursAr: 'hours-ar',
  mapsUrl: 'maps-url',
  mapsUrlLength: 'maps-url-length',
};

const schema = siteSettingsInputSchema(M);

function issueMessage(input: unknown, field: string): string | undefined {
  const parsed = schema.safeParse(input);
  expect(parsed.success).toBe(false);
  assert(!parsed.success);
  return parsed.error.issues.find(
    (candidate) => candidate.path.join('.') === field
  )?.message;
}

describe('siteSettingsInputSchema contact phone', () => {
  it.each([
    ['+20 100 123 4567', '+20 100 123 4567'],
    ['(02) 2345-6789', '(02) 2345-6789'],
    ['+1 (202) 555-0143', '+1 (202) 555-0143'],
    // Stored exactly as typed, with only the outer whitespace removed.
    ['  +20 100 123 4567  ', '+20 100 123 4567'],
  ])('%j is kept as the display value %j', (contactPhone, expected) => {
    const parsed = schema.safeParse({ contactPhone });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.contactPhone).toBe(expected);
  });

  it.each([
    // Five digits is one short of the minimum.
    '12345',
    'abc',
    '+20 100 123 4567 ext 5',
    '+20 100 123 4567/8',
  ])('%j is rejected with the format message', (contactPhone) => {
    expect(issueMessage({ contactPhone }, 'contactPhone')).toBe(M.contactPhone);
  });

  it('caps the display value at 30 characters', () => {
    expect(issueMessage({ contactPhone: '1'.repeat(31) }, 'contactPhone')).toBe(
      M.contactPhoneLength
    );
    expect(schema.safeParse({ contactPhone: '1'.repeat(30) }).success).toBe(
      true
    );
  });

  it('turns blank, null or omitted into null', () => {
    for (const input of [
      { contactPhone: '' },
      { contactPhone: '   ' },
      { contactPhone: null },
      {},
    ]) {
      const parsed = schema.safeParse(input);
      expect(parsed.success, JSON.stringify(input)).toBe(true);
      assert(parsed.success);
      expect(parsed.data.contactPhone).toBeNull();
    }
  });
});

describe('siteSettingsInputSchema contact email', () => {
  it('accepts a valid address and stores it unchanged', () => {
    const parsed = schema.safeParse({ contactEmail: 'info@yourcompany.com' });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.contactEmail).toBe('info@yourcompany.com');
  });

  it('lowercases the address and trims the outer spaces', () => {
    const parsed = schema.safeParse({
      contactEmail: '  INFO@YourCompany.COM  ',
    });
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.contactEmail).toBe('info@yourcompany.com');
  });

  it('rejects a string without an @ with the format message', () => {
    expect(issueMessage({ contactEmail: 'not-an-email' }, 'contactEmail')).toBe(
      M.contactEmail
    );
    expect(issueMessage({ contactEmail: 'info@' }, 'contactEmail')).toBe(
      M.contactEmail
    );
  });

  it('caps the address at 254 characters', () => {
    const tooLong = `${'a'.repeat(243)}@example.com`;
    expect(tooLong.length).toBe(255);
    expect(issueMessage({ contactEmail: tooLong }, 'contactEmail')).toBe(
      M.contactEmailLength
    );
  });

  it('turns blank, null or omitted into null', () => {
    for (const input of [
      { contactEmail: '' },
      { contactEmail: '   ' },
      { contactEmail: null },
      {},
    ]) {
      const parsed = schema.safeParse(input);
      expect(parsed.success, JSON.stringify(input)).toBe(true);
      assert(parsed.success);
      expect(parsed.data.contactEmail).toBeNull();
    }
  });
});

describe('siteSettingsInputSchema address, hours and location link', () => {
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
      expect(issueMessage({ mapsUrl }, 'mapsUrl')).toBe(M.mapsUrl);
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

  it('no longer has a coordinates field', () => {
    expect(schema.shape).not.toHaveProperty('coordinates');
  });
});
