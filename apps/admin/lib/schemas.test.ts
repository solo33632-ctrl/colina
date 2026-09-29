import { assert, describe, expect, it } from 'vitest';
import {
  agentInputSchema,
  categoryInputSchema,
  machineInputSchema,
  newsInputSchema,
  partnerInputSchema,
  serviceInputSchema,
} from './schemas';

// Short fixed messages: these tests pin the RULES, not the copy.
const M = {
  nameAr: 'e',
  nameEn: 'e',
  slug: 'e',
  descriptionAr: 'e',
  descriptionEn: 'e',
  image: 'e',
  categoryId: 'e',
  shortDescriptionAr: 'e',
  shortDescriptionEn: 'e',
  specsAr: 'e',
  specsEn: 'e',
  imageUrl: 'e',
  imagePosition: 'e',
  datasheetUrl: 'e',
  logo: 'e',
  titleAr: 'e',
  titleEn: 'e',
  scopeAr: 'e',
  scopeEn: 'e',
  icon: 'e',
  bodyAr: 'e',
  bodyEn: 'e',
  publishedAt: 'e',
  countryAr: 'e',
  countryEn: 'e',
};

function expectInvalid(
  result:
    | { success: true; data: unknown }
    | { success: false; error: { issues: Array<{ path: PropertyKey[] }> } },
  field: string
) {
  expect(result.success).toBe(false);
  assert(!result.success);
  expect(result.error.issues.map((issue) => issue.path.join('.'))).toContain(
    field
  );
}

describe('categoryInputSchema', () => {
  const valid = {
    nameAr: 'فئة',
    nameEn: 'Category',
    slug: 'valid-slug-1',
    descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
    descriptionEn: 'Description long enough, over ten.',
    image: '',
  };

  it('accepts valid input', () => {
    expect(categoryInputSchema(M).safeParse(valid).success).toBe(true);
  });

  it('rejects bad slugs but accepts lowercase-dash form', () => {
    expectInvalid(
      categoryInputSchema(M).safeParse({ ...valid, slug: 'Bad Slug!' }),
      'slug'
    );
    expectInvalid(
      categoryInputSchema(M).safeParse({ ...valid, slug: 'x' }),
      'slug'
    );
    expect(
      categoryInputSchema(M).safeParse({ ...valid, slug: 'ok-slug-2' }).success
    ).toBe(true);
  });
});

describe('URL rules (Phase 13 table, now automated)', () => {
  const cases: Array<[string, boolean]> = [
    ['https://cdn.test/a.jpg', true],
    ['http://cdn.test/a.png', true],
    ['javascript:alert(1)', false],
    ['data:text/html,<h1>x</h1>', false],
    ['/images/seed/x.jpg', false],
    ['', true],
    ['ftp://files.test/x', false],
    ['not a url', false],
  ];

  it('category image: absolute http(s) or empty only', () => {
    const base = {
      nameAr: 'فئة',
      nameEn: 'Category',
      slug: 'slug-x',
      descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
      descriptionEn: 'Description long enough, over ten.',
    };
    for (const [url, expected] of cases) {
      const result = categoryInputSchema(M).safeParse({ ...base, image: url });
      expect(result.success, url).toBe(expected);
    }
  });

  it('partner logo: absolute http(s) or empty only', () => {
    // Was "required absolute http(s)": an empty logo was rejected. That made
    // the partner form's own clear-logo control unsavable, and forced the seed
    // to invent a URL for every partner. The rule is now the same optional
    // http(s) one the category image and news image use, so the shared `cases`
    // table applies unmodified — `''` is expected to pass, as it already is
    // for those two.
    for (const [url, expected] of cases) {
      const result = partnerInputSchema(M).safeParse({
        nameAr: 'شريك',
        nameEn: 'Partner',
        logo: url,
      });
      expect(result.success, url).toBe(expected);
    }
  });

  it('machine gallery + datasheet follow the same rules', () => {
    const base = {
      nameAr: 'آلة',
      nameEn: 'Machine',
      slug: 'machine-x',
      categoryId: 'c'.repeat(25),
      shortDescriptionAr: 'وصف قصير كاف يزيد عن عشرة.',
      shortDescriptionEn: 'Short description, over ten chars.',
      descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
      descriptionEn: 'Description long enough, over ten.',
      specsAr: 's',
      specsEn: 's',
      relatedIds: [],
      featured: false,
    };
    const gallery = (url: string) =>
      machineInputSchema(M).safeParse({
        ...base,
        datasheetUrl: '',
        images: [{ url, position: 0 }],
      }).success;
    expect(gallery('https://cdn.test/g.jpg')).toBe(true);
    expect(gallery('javascript:alert(1)')).toBe(false);
    const sheet = (url: string) =>
      machineInputSchema(M).safeParse({
        ...base,
        datasheetUrl: url,
        images: [],
      }).success;
    expect(sheet('')).toBe(true);
    expect(sheet('https://cdn.test/d.pdf')).toBe(true);
    expect(sheet('data:application/pdf,zzz')).toBe(false);
  });

  it('machine featured must be a real boolean, and never blocks on the cap', () => {
    const base = {
      nameAr: 'آلة',
      nameEn: 'Machine',
      slug: 'machine-x',
      categoryId: 'c'.repeat(25),
      shortDescriptionAr: 'وصف قصير كاف يزيد عن عشرة.',
      shortDescriptionEn: 'Short description, over ten chars.',
      descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
      descriptionEn: 'Description long enough, over ten.',
      specsAr: 's',
      specsEn: 's',
      datasheetUrl: '',
      images: [],
      relatedIds: [],
    };
    const parse = (featured: unknown) =>
      machineInputSchema(M).safeParse({ ...base, featured });

    expect(parse(true).success).toBe(true);
    expect(parse(false).success).toBe(true);
    // A checkbox posts its value as a string when it is not registered with
    // react-hook-form, so a non-boolean has to be refused rather than coerced.
    expect(parse('true').success).toBe(false);
    expect(parse(undefined).success).toBe(false);
    // The cap is a homepage display limit, not a validation rule: featuring
    // a machine is never rejected, however many others are already featured.
    expect(parse(true).success).toBe(true);
  });

  it('news image is optional but must be http(s) when present', () => {
    const base = {
      slug: 'news-x',
      titleAr: 'خبر',
      titleEn: 'News',
      bodyAr: 'نص كاف يزيد عن عشرة أحرف.',
      bodyEn: 'Body long enough, over ten chars.',
      publishedAt: '2026-09-01',
    };
    expect(newsInputSchema(M).safeParse({ ...base, image: '' }).success).toBe(
      true
    );
    expect(
      newsInputSchema(M).safeParse({ ...base, image: 'javascript:alert(1)' })
        .success
    ).toBe(false);
  });
});

describe('serviceInputSchema', () => {
  it('accepts a full valid service, rejects short titles', () => {
    const valid = {
      slug: 'service-x',
      titleAr: 'خدمة',
      titleEn: 'Service',
      descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
      descriptionEn: 'Description long enough, over ten.',
      scopeAr: 'نطاق كاف يزيد عن عشرة أحرف.',
      scopeEn: 'Scope long enough, over ten chars.',
      icon: 'wrench',
    };
    expect(serviceInputSchema(M).safeParse(valid).success).toBe(true);
    expectInvalid(
      serviceInputSchema(M).safeParse({ ...valid, titleEn: 'x' }),
      'titleEn'
    );
  });
});

describe('newsInputSchema dates', () => {
  const base = {
    slug: 'news-x',
    titleAr: 'خبر',
    titleEn: 'News',
    bodyAr: 'نص كاف يزيد عن عشرة أحرف.',
    bodyEn: 'Body long enough, over ten chars.',
    image: '',
  };

  it('accepts YYYY-MM-DD, rejects malformed dates', () => {
    expect(
      newsInputSchema(M).safeParse({ ...base, publishedAt: '2026-09-01' })
        .success
    ).toBe(true);
    expectInvalid(
      newsInputSchema(M).safeParse({ ...base, publishedAt: '09/01/2026' }),
      'publishedAt'
    );
  });

  it('accepts a missing date (schema default applies server-side)', () => {
    const { publishedAt: _dropped, ...rest } = {
      ...base,
      publishedAt: '2026-09-01',
    };
    void _dropped;
    expect(newsInputSchema(M).safeParse(rest).success).toBe(true);
  });
});

describe('agentInputSchema', () => {
  it('requires countries, leaves the rest optional', () => {
    expect(
      agentInputSchema(M).safeParse({ countryAr: 'مصر', countryEn: 'Egypt' })
        .success
    ).toBe(true);
    expectInvalid(
      agentInputSchema(M).safeParse({ countryAr: 'x', countryEn: 'Egypt' }),
      'countryAr'
    );
  });
});
