import { describe, expect, it } from 'vitest';
import { slugify } from './slug';

describe('slugify', () => {
  it('lowercases and dashes the English name', () => {
    expect(slugify('Colina Pack S')).toBe('colina-pack-s');
    expect(slugify('Conveying Systems')).toBe('conveying-systems');
  });

  it('collapses runs of punctuation and whitespace into one dash', () => {
    expect(slugify('Spare   Parts /  (2024)')).toBe('spare-parts-2024');
    expect(slugify('A--B')).toBe('a-b');
  });

  it('trims leading and trailing dashes', () => {
    expect(slugify('  -Wrench-  ')).toBe('wrench');
    expect(slugify('...')).toBe('');
  });

  it('keeps digits', () => {
    expect(slugify('Colina Pro 1000')).toBe('colina-pro-1000');
  });

  // A slug is a URL segment, so non-ASCII is dropped rather than encoded. The
  // Arabic name derives nothing and the editor fills the field by hand.
  it('drops non-latin scripts', () => {
    expect(slugify('آلات التغليف')).toBe('');
    expect(slugify('Ünïcode 42!')).toBe('n-code-42');
  });

  it('only ever produces characters the slug schema accepts', () => {
    const samples = ['Colina Pack S', '  spaces  ', '!!!', 'a', 'ÄÖÜ', ''];
    for (const sample of samples) {
      // The contract is "valid slug or nothing": an input with no ASCII in it
      // derives an empty string, and the form then leaves the field alone.
      const result = slugify(sample);
      expect(result === '' || /^[a-z0-9]+(-[a-z0-9]+)*$/.test(result)).toBe(
        true
      );
    }
    expect(slugify('ÄÖÜ')).toBe('');
  });
});
