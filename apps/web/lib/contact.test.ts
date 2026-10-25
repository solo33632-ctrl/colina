import { describe, expect, it } from 'vitest';
import {
  sanitizeContactEmail,
  sanitizeContactPhone,
  sanitizeMapsUrl,
  telHref,
  trimmedOrNull,
} from './contact';

describe('trimmedOrNull', () => {
  it('trims text and turns blank or absent values into null', () => {
    expect(trimmedOrNull('  Cairo  ')).toBe('Cairo');
    expect(trimmedOrNull('   ')).toBeNull();
    expect(trimmedOrNull('')).toBeNull();
    expect(trimmedOrNull(null)).toBeNull();
    expect(trimmedOrNull(undefined)).toBeNull();
  });
});

describe('sanitizeContactPhone', () => {
  it.each([
    ['+20 100 123 4567', '+20 100 123 4567'],
    ['(02) 2345-6789', '(02) 2345-6789'],
    ['+1 (202) 555-0143', '+1 (202) 555-0143'],
    ['  +20 100 123 4567  ', '+20 100 123 4567'],
    ['123456', '123456'],
  ])('%j is a display phone', (input, expected) => {
    expect(sanitizeContactPhone(input)).toBe(expected);
  });

  it.each([
    '12345',
    'abc',
    '+20 100 123 4567 ext 5',
    '+20 100 123 4567/8',
    '1'.repeat(31),
    '',
    '   ',
  ])('%j is ignored', (input) => {
    expect(sanitizeContactPhone(input)).toBeNull();
  });

  it('ignores null and undefined', () => {
    expect(sanitizeContactPhone(null)).toBeNull();
    expect(sanitizeContactPhone(undefined)).toBeNull();
  });
});

describe('sanitizeContactEmail', () => {
  it.each([
    'info@yourcompany.com',
    'sales.department@sub.example.co.uk',
    '  INFO@YourCompany.COM  ',
  ])('%j is a usable email', (input) => {
    expect(sanitizeContactEmail(input)).toBe(input.trim());
  });

  it.each([
    'not-an-email',
    'info@',
    '@example.com',
    'info@@example.com',
    'info@example',
    'info @example.com',
    'info@example .com',
    `${'a'.repeat(243)}@example.com`,
    '',
    '   ',
  ])('%j is ignored', (input) => {
    expect(sanitizeContactEmail(input)).toBeNull();
  });

  it('ignores null and undefined', () => {
    expect(sanitizeContactEmail(null)).toBeNull();
    expect(sanitizeContactEmail(undefined)).toBeNull();
  });
});

describe('sanitizeMapsUrl', () => {
  it('keeps an absolute https URL, trimmed', () => {
    expect(
      sanitizeMapsUrl('  https://maps.google.com/?q=30.0444,31.2357  ')
    ).toBe('https://maps.google.com/?q=30.0444,31.2357');
  });

  it.each([
    'http://maps.google.com/?q=30.0444,31.2357',
    'javascript:alert(1)',
    'data:text/html,hello',
    '/maps/place',
    'maps.google.com',
    '',
    '   ',
  ])('%j is ignored', (input) => {
    expect(sanitizeMapsUrl(input)).toBeNull();
  });
});

describe('telHref', () => {
  it('keeps only the leading plus and digits', () => {
    expect(telHref('+20 100 123 4567')).toBe('tel:+201001234567');
    expect(telHref('(02) 2345-6789')).toBe('tel:0223456789');
    expect(telHref('  +1 (202) 555-0143  ')).toBe('tel:+12025550143');
  });
});
