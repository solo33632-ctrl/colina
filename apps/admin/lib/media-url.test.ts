import { afterEach, describe, expect, it } from 'vitest';
import {
  MEDIA_URL_MAX_LENGTH,
  isAllowedMediaUrl,
  mediaFieldIssues,
  mediaUrlSchema,
  optionalMediaUrlSchema,
} from './media-url';

// Unit tests for the Stage 4c media allowlist. The rule is deliberately
// strict: https, exactly res.cloudinary.com, exactly the configured cloud,
// no credentials/port/query/fragment. The zod wrappers add the update-only
// grandfathering of an exact stored value.

const ORIGINAL_ENV = process.env;
const CLOUD = 'test-cloud';
const GOOD = `https://res.cloudinary.com/${CLOUD}/image/upload/v1/colina/photo.jpg`;

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

function withCloud(name: string | undefined) {
  if (name === undefined) {
    delete process.env.CLOUDINARY_CLOUD_NAME;
  } else {
    process.env.CLOUDINARY_CLOUD_NAME = name;
  }
}

describe('isAllowedMediaUrl', () => {
  it('accepts an https URL on the configured Cloudinary cloud', () => {
    withCloud(CLOUD);
    expect(isAllowedMediaUrl(GOOD)).toBe(true);
    expect(
      isAllowedMediaUrl(
        `https://res.cloudinary.com/${CLOUD}/raw/upload/colina/datasheets/sheet.pdf`
      )
    ).toBe(true);
  });

  it('rejects another host, cloud, scheme, port or credentials', () => {
    withCloud(CLOUD);
    const refused = [
      'https://cdn.example.com/photo.jpg',
      'https://res.cloudinary.com/other-cloud/image/upload/photo.jpg',
      `http://res.cloudinary.com/${CLOUD}/image/upload/photo.jpg`,
      `https://res.cloudinary.com:8443/${CLOUD}/image/upload/photo.jpg`,
      `https://user:pass@res.cloudinary.com/${CLOUD}/image/upload/photo.jpg`,
      'https://res.cloudinary.com.evil.test/test-cloud/image/upload/photo.jpg',
      `https://res.cloudinary.com/${CLOUD}@evil.test/image/upload/photo.jpg`,
      `https://sub.res.cloudinary.com/${CLOUD}/image/upload/photo.jpg`,
    ];
    for (const value of refused) {
      expect(isAllowedMediaUrl(value), value).toBe(false);
    }
  });

  it('rejects query strings, fragments, relative paths and non-web schemes', () => {
    withCloud(CLOUD);
    const refused = [
      `${GOOD}?download=1`,
      `${GOOD}#fragment`,
      '/images/seed/photo.jpg',
      'data:image/png;base64,AAAA',
      'javascript:alert(1)',
      'not a url',
      '',
    ];
    for (const value of refused) {
      expect(isAllowedMediaUrl(value), value).toBe(false);
    }
  });

  it('enforces the path prefix of the configured cloud exactly', () => {
    withCloud(CLOUD);
    expect(
      isAllowedMediaUrl(
        `https://res.cloudinary.com/${CLOUD}-lookalike/image/upload/photo.jpg`
      )
    ).toBe(false);
    expect(
      isAllowedMediaUrl(
        `https://res.cloudinary.com/${CLOUD}/image/upload/photo.jpg`
      )
    ).toBe(true);
  });

  it('rejects an overlong URL', () => {
    withCloud(CLOUD);
    const overlong = `https://res.cloudinary.com/${CLOUD}/image/upload/${'a'.repeat(
      MEDIA_URL_MAX_LENGTH
    )}.jpg`;
    expect(overlong.length).toBeGreaterThan(MEDIA_URL_MAX_LENGTH);
    expect(isAllowedMediaUrl(overlong)).toBe(false);
  });

  it('fails closed when the cloud name is not configured', () => {
    withCloud(undefined);
    expect(isAllowedMediaUrl(GOOD)).toBe(false);
    withCloud('   ');
    expect(isAllowedMediaUrl(GOOD)).toBe(false);
  });
});

describe('mediaUrlSchema', () => {
  it('accepts only the allowlisted shape unless the stored value is unchanged', () => {
    withCloud(CLOUD);
    expect(mediaUrlSchema('bad').safeParse(GOOD).success).toBe(true);
    expect(
      mediaUrlSchema('bad').safeParse('https://cdn.test/x.jpg').success
    ).toBe(false);
    const legacy = '/images/seed/old.jpg';
    expect(mediaUrlSchema('bad').safeParse(legacy).success).toBe(false);
    expect(
      mediaUrlSchema('bad', { unchanged: legacy }).safeParse(legacy).success
    ).toBe(true);
    // Only an EXACT match is grandfathered, not another old path.
    expect(
      mediaUrlSchema('bad', { unchanged: legacy }).safeParse(
        '/images/seed/other.jpg'
      ).success
    ).toBe(false);
  });
});

describe('optionalMediaUrlSchema', () => {
  it('keeps the optional/empty meaning and still refuses changed bad values', () => {
    withCloud(CLOUD);
    const schema = optionalMediaUrlSchema('bad');
    expect(schema.safeParse(undefined).success).toBe(true);
    expect(schema.safeParse('').success).toBe(true);
    expect(schema.safeParse(GOOD).success).toBe(true);
    expect(schema.safeParse('https://cdn.test/x.jpg').success).toBe(false);
  });

  it('grandfathers an exact stored legacy value on update', () => {
    withCloud(CLOUD);
    const stored = 'https://picsum.photos/seed/old/800/600';
    expect(
      optionalMediaUrlSchema('bad', { unchanged: stored }).safeParse(stored)
        .success
    ).toBe(true);
    expect(
      optionalMediaUrlSchema('bad', { unchanged: stored }).safeParse(
        'https://evil.test/x.jpg'
      ).success
    ).toBe(false);
  });
});

describe('mediaFieldIssues', () => {
  it('returns the same field/message shape the actions already use', () => {
    withCloud(CLOUD);
    const issues = mediaFieldIssues([
      {
        field: 'image',
        value: 'https://evil.test/x.jpg',
        optional: true,
        message: 'bad image',
      },
      { field: 'logo', value: GOOD, optional: true, message: 'bad logo' },
    ]);
    expect(issues).toEqual([{ field: 'image', message: 'bad image' }]);
  });
});
