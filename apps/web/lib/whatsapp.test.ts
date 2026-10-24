import { describe, expect, it } from 'vitest';
import {
  buildWhatsappUrl,
  isValidWhatsappNumber,
  WHATSAPP_NUMBER_MAX_LENGTH,
  WHATSAPP_NUMBER_MIN_LENGTH,
} from './whatsapp';

describe('isValidWhatsappNumber', () => {
  it('accepts digits-only international numbers of 8 to 15 digits', () => {
    expect(isValidWhatsappNumber('201001234567')).toBe(true);
    expect(isValidWhatsappNumber('12345678')).toBe(true);
    expect(isValidWhatsappNumber('1'.repeat(WHATSAPP_NUMBER_MAX_LENGTH))).toBe(
      true
    );
    expect(isValidWhatsappNumber('1'.repeat(WHATSAPP_NUMBER_MIN_LENGTH))).toBe(
      true
    );
  });

  it('rejects a leading zero, punctuation, whitespace and Arabic-Indic digits', () => {
    // The admin's own normalization refuses this; a stale row must not slip
    // through to a wa.me link.
    expect(isValidWhatsappNumber('01234567')).toBe(false);
    expect(isValidWhatsappNumber('0123')).toBe(false);
    expect(isValidWhatsappNumber('+201001234567')).toBe(false);
    expect(isValidWhatsappNumber('20 100 123 4567')).toBe(false);
    expect(isValidWhatsappNumber('20100-1234567')).toBe(false);
    expect(isValidWhatsappNumber('٠١٠٠١٢٣٤٥٦٧')).toBe(false);
  });

  it('rejects too-short, too-long and empty values', () => {
    expect(isValidWhatsappNumber('1234567')).toBe(false);
    expect(
      isValidWhatsappNumber('1'.repeat(WHATSAPP_NUMBER_MAX_LENGTH + 1))
    ).toBe(false);
    expect(isValidWhatsappNumber('')).toBe(false);
    expect(isValidWhatsappNumber(null)).toBe(false);
    expect(isValidWhatsappNumber(undefined)).toBe(false);
  });
});

describe('buildWhatsappUrl', () => {
  it('builds a plain wa.me URL for an empty greeting', () => {
    expect(buildWhatsappUrl('201001234567', '')).toBe(
      'https://wa.me/201001234567'
    );
    expect(buildWhatsappUrl('201001234567', '   ')).toBe(
      'https://wa.me/201001234567'
    );
  });

  it('encodes spaces and ampersands instead of ending the query early', () => {
    expect(buildWhatsappUrl('201001234567', 'Hello there & welcome')).toBe(
      'https://wa.me/201001234567?text=Hello%20there%20%26%20welcome'
    );
  });

  it('encodes Arabic text, including the greeting punctuation', () => {
    const message = 'مرحباً، أود الاستفسار عن خدماتكم.';
    expect(buildWhatsappUrl('201001234567', message)).toBe(
      `https://wa.me/201001234567?text=${encodeURIComponent(message)}`
    );
    // The encoded URL is ASCII-only, so the query survives any intermediary.
    expect(buildWhatsappUrl('201001234567', message)).toMatch(
      /^https:\/\/wa\.me\/201001234567\?text=[A-Za-z0-9%._~!*'()-]+$/
    );
  });
});
