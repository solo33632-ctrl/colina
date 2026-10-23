import { assert, describe, expect, it } from 'vitest';
import {
  agentInputSchema,
  categoryInputSchema,
  machineInputSchema,
  maintenanceCategoryInputSchema,
  newsInputSchema,
  partnerInputSchema,
  serviceInputSchema,
  showcaseInputSchema,
} from './schemas';

// Short fixed messages: these tests pin the RULES, not the copy.
const M = {
  nameAr: 'e',
  nameEn: 'e',
  slug: 'e',
  descriptionAr: 'e',
  descriptionEn: 'e',
  image: 'e',
  imageUrl: 'e',
  sortOrder: 'e',
  categoryId: 'e',
  shortDescriptionAr: 'e',
  shortDescriptionEn: 'e',
  specsAr: 'e',
  specsEn: 'e',
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
  beforeImageUrl: 'e',
  afterImageUrl: 'e',
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

  it('accepts a completely blank description (Phase 26: optional field)', () => {
    // The description was previously required with a min of 10 characters;
    // it is now fully optional, and blank in either locale must save.
    const blank = { ...valid, descriptionAr: '', descriptionEn: '' };
    expect(categoryInputSchema(M).safeParse(blank).success).toBe(true);
    // ...and a payload that omits the keys entirely (defensive server-side
    // normalisation to '' in the Server Action).
    const {
      descriptionAr: _droppedAr,
      descriptionEn: _droppedEn,
      ...rest
    } = blank;
    void _droppedAr;
    void _droppedEn;
    expect(categoryInputSchema(M).safeParse(rest).success).toBe(true);
  });
});

describe('maintenanceCategoryInputSchema', () => {
  const valid = {
    nameAr: 'خط إنتاج',
    nameEn: 'Production line',
    slug: 'production-line',
    descriptionAr: '',
    descriptionEn: '',
    imageUrl: '',
    sortOrder: 0,
  };

  it('accepts valid input and defaults the display order to 0', () => {
    expect(maintenanceCategoryInputSchema(M).safeParse(valid).success).toBe(
      true
    );
    const { sortOrder: _dropped, ...withoutOrder } = valid;
    void _dropped;
    const parsed = maintenanceCategoryInputSchema(M).safeParse(withoutOrder);
    expect(parsed.success).toBe(true);
    assert(parsed.success);
    expect(parsed.data.sortOrder).toBe(0);
  });

  it('requires both names and uses the shared slug rule', () => {
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, nameAr: '' }),
      'nameAr'
    );
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, nameEn: 'x' }),
      'nameEn'
    );
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        slug: 'Bad Slug!',
      }),
      'slug'
    );
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, slug: 'x' }),
      'slug'
    );
  });

  it('leaves descriptions optional and validates the cover photo like other images', () => {
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        descriptionAr: 'وصف اختياري.',
        descriptionEn: 'Optional description.',
        imageUrl: 'https://cdn.test/line.jpg',
      }).success
    ).toBe(true);
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        imageUrl: 'javascript:alert(1)',
      }).success
    ).toBe(false);
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        imageUrl: '/images/seed/line.jpg',
      }).success
    ).toBe(false);
  });

  it('requires a non-negative integer display order', () => {
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, sortOrder: -1 }),
      'sortOrder'
    );
    expectInvalid(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, sortOrder: 1.5 }),
      'sortOrder'
    );
    expect(
      maintenanceCategoryInputSchema(M).safeParse({ ...valid, sortOrder: 12 })
        .success
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

  it('machine input carries no featured flag, whatever the caller sends', () => {
    // The home page's featured strip is gone, so the form no longer asks and
    // the action no longer writes. The column stays in the database; this pins
    // that the schema has stopped talking about it, so a stray checkbox cannot
    // come back unnoticed.
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

    // No `featured` key at all: the ordinary shape of every save now.
    expect(machineInputSchema(M).safeParse(base).success).toBe(true);
    // And an extra one is simply ignored by Zod rather than demanded — the
    // point being that nothing requires it any more, in either direction.
    expect(
      machineInputSchema(M).safeParse({ ...base, featured: true }).success
    ).toBe(true);
    expect(
      machineInputSchema(M).safeParse({ ...base, featured: undefined }).success
    ).toBe(true);
    expect(machineInputSchema(M).shape).not.toHaveProperty('featured');
  });

  it('machine long-form fields are optional; identity and short description stay required', () => {
    const base = {
      nameAr: 'آلة',
      nameEn: 'Machine',
      slug: 'machine-x',
      categoryId: 'c'.repeat(25),
      shortDescriptionAr: 'وصف قصير كاف يزيد عن عشرة.',
      shortDescriptionEn: 'Short description, over ten chars.',
      datasheetUrl: '',
      images: [],
      relatedIds: [],
    };

    // Blank full description and specs (both locales) must save (Phase 26).
    const blank = machineInputSchema(M).safeParse({
      ...base,
      descriptionAr: '',
      descriptionEn: '',
      specsAr: '',
      specsEn: '',
    });
    expect(blank.success).toBe(true);

    // Omitting them entirely is accepted too (Server Action normalises to '').
    const omitted = machineInputSchema(M).safeParse(base);
    expect(omitted.success).toBe(true);

    // What the brief said to KEEP required:
    // - name (the card/listing label)...
    expectInvalid(
      machineInputSchema(M).safeParse({ ...base, nameEn: '' }),
      'nameEn'
    );
    expectInvalid(
      machineInputSchema(M).safeParse({
        ...base,
        nameEn: 'x'.repeat(30),
        nameAr: 'n',
      }),
      'nameAr'
    );
    // - ...and the short description (the machine page's lead paragraph and
    //   meta description), which keeps its min-10 rule.
    expectInvalid(
      machineInputSchema(M).safeParse({
        ...base,
        descriptionAr: '',
        descriptionEn: '',
        specsAr: '',
        specsEn: '',
        shortDescriptionEn: 'short',
      }),
      'shortDescriptionEn'
    );
    expectInvalid(
      machineInputSchema(M).safeParse({ ...base, categoryId: '' }),
      'categoryId'
    );
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

describe('showcaseInputSchema', () => {
  const valid = {
    nameAr: 'ماكينة',
    nameEn: 'Machine',
    categoryId: 'category-1',
    descriptionAr: 'وصف اختياري.',
    descriptionEn: 'Optional description.',
    beforeImageUrl: 'https://cdn.test/before.jpg',
    afterImageUrl: 'https://cdn.test/after.jpg',
  };

  it('accepts valid input', () => {
    expect(showcaseInputSchema(M).safeParse(valid).success).toBe(true);
  });

  it('requires a maintenance category on every save', () => {
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, categoryId: '' }),
      'categoryId'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, categoryId: undefined }),
      'categoryId'
    );
  });

  it('requires both names', () => {
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, nameAr: '' }),
      'nameAr'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, nameEn: '' }),
      'nameEn'
    );
    // One character is still under the min-2 rule the other entities use.
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, nameEn: 'x' }),
      'nameEn'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, nameEn: undefined }),
      'nameEn'
    );
  });

  it('requires BOTH photos — one half of a comparison is not a record', () => {
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, beforeImageUrl: '' }),
      'beforeImageUrl'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, afterImageUrl: '' }),
      'afterImageUrl'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, beforeImageUrl: undefined }),
      'beforeImageUrl'
    );
    expectInvalid(
      showcaseInputSchema(M).safeParse({ ...valid, afterImageUrl: undefined }),
      'afterImageUrl'
    );
  });

  it('both photos follow the shared absolute-http(s) rule', () => {
    // The same table the other stored images use, except `''` now FAILS: this
    // field is required, so the empty case the optional rules allow is the one
    // entry whose expectation is inverted. Declared locally rather than shared,
    // because the shared `cases` lives inside the URL-rules describe.
    const urlCases: Array<[string, boolean]> = [
      ['https://cdn.test/a.jpg', true],
      ['http://cdn.test/a.png', true],
      ['javascript:alert(1)', false],
      ['data:text/html,<h1>x</h1>', false],
      ['/images/seed/x.jpg', false],
      ['', false],
      ['ftp://files.test/x', false],
      ['not a url', false],
    ];
    for (const [url, expected] of urlCases) {
      for (const field of ['beforeImageUrl', 'afterImageUrl'] as const) {
        const result = showcaseInputSchema(M).safeParse({
          ...valid,
          [field]: url,
        });
        expect(result.success, `${field}=${url}`).toBe(expected);
      }
    }
  });

  it('descriptions are optional in every form they can arrive in', () => {
    // Blank, the empty string the form posts, and omitted entirely (the Server
    // Action normalises undefined to null before writing).
    expect(
      showcaseInputSchema(M).safeParse({
        ...valid,
        descriptionAr: '',
        descriptionEn: '',
      }).success
    ).toBe(true);
    const {
      descriptionAr: _droppedAr,
      descriptionEn: _droppedEn,
      ...rest
    } = valid;
    void _droppedAr;
    void _droppedEn;
    expect(showcaseInputSchema(M).safeParse(rest).success).toBe(true);
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
