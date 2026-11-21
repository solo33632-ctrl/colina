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
  websiteUrl: 'e',
  websiteUrlLength: 'e',
  logoUrl: 'e',
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

  it('leaves descriptions optional and carries the cover photo as a plain string', () => {
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        descriptionAr: 'وصف اختياري.',
        descriptionEn: 'Optional description.',
        imageUrl: 'https://res.cloudinary.com/test-cloud/image/upload/line.jpg',
      }).success
    ).toBe(true);
    // Stage 4c: the host/cloud allowlist moved to the Server Action, which
    // must load the stored row to grandfather an unchanged legacy value. The
    // shared schema therefore only carries the field; `media-url.test.ts` and
    // the action tests pin the rule itself.
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        imageUrl: 'javascript:alert(1)',
      }).success
    ).toBe(true);
    expect(
      maintenanceCategoryInputSchema(M).safeParse({
        ...valid,
        imageUrl: '/images/seed/line.jpg',
      }).success
    ).toBe(true);
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

describe('media fields: presence only in the shared schema', () => {
  // Stage 4c moved the stored-media allowlist (https + the project's own
  // Cloudinary cloud, with an exact stored value grandfathered on update) to
  // the Server Actions, because only they can read the row being edited.
  // These tests pin the schema's half of the contract: the field reaches the
  // action untouched, so a legacy value can be compared with what is stored.
  // The rule itself is covered by `media-url.test.ts` and the action tests.
  const base = {
    nameAr: 'فئة',
    nameEn: 'Category',
    slug: 'slug-x',
    descriptionAr: 'وصف كاف يزيد عن عشرة أحرف.',
    descriptionEn: 'Description long enough, over ten.',
  };

  it('category image: optional, and any submitted string reaches the action', () => {
    for (const image of [
      'https://res.cloudinary.com/test-cloud/image/upload/a.jpg',
      'javascript:alert(1)',
      '/images/seed/x.jpg',
      '',
    ]) {
      expect(
        categoryInputSchema(M).safeParse({ ...base, image }).success,
        image
      ).toBe(true);
    }
  });

  it('partner logo: optional, and any submitted string reaches the action', () => {
    for (const logo of [
      'https://res.cloudinary.com/test-cloud/image/upload/logo.png',
      'javascript:alert(1)',
      '/images/seed/logo.png',
      '',
    ]) {
      expect(
        partnerInputSchema(M).safeParse({
          nameAr: 'شريك',
          nameEn: 'Partner',
          logo,
        }).success,
        logo
      ).toBe(true);
    }
  });

  it('machine gallery stays required; datasheet stays optional', () => {
    const machineBase = {
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
        ...machineBase,
        datasheetUrl: '',
        images: [{ url, position: 0 }],
      }).success;
    // Presence is the schema's job; the URL shape is the action's.
    expect(
      gallery('https://res.cloudinary.com/test-cloud/image/upload/g.jpg')
    ).toBe(true);
    expect(gallery('javascript:alert(1)')).toBe(true);
    expect(gallery('')).toBe(false);
    const sheet = (url: string) =>
      machineInputSchema(M).safeParse({
        ...machineBase,
        datasheetUrl: url,
        images: [],
      }).success;
    expect(sheet('')).toBe(true);
    expect(
      sheet('https://res.cloudinary.com/test-cloud/raw/upload/d.pdf')
    ).toBe(true);
    expect(sheet('data:application/pdf,zzz')).toBe(true);
  });

  it('machine input carries no featured flag, whatever the caller sends', () => {
    // The home page's featured strip is gone, so the form no longer asks and
    // the action no longer writes. The column stays in the database; this pins
    // that the schema has stopped talking about it, so a stray checkbox cannot
    // come back unnoticed.
    const machineBase = {
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
    expect(machineInputSchema(M).safeParse(machineBase).success).toBe(true);
    // And an extra one is simply ignored by Zod rather than demanded — the
    // point being that nothing requires it any more, in either direction.
    expect(
      machineInputSchema(M).safeParse({ ...machineBase, featured: true })
        .success
    ).toBe(true);
    expect(
      machineInputSchema(M).safeParse({ ...machineBase, featured: undefined })
        .success
    ).toBe(true);
    expect(machineInputSchema(M).shape).not.toHaveProperty('featured');
  });

  it('machine long-form fields are optional; identity and short description stay required', () => {
    const machineBase = {
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
      ...machineBase,
      descriptionAr: '',
      descriptionEn: '',
      specsAr: '',
      specsEn: '',
    });
    expect(blank.success).toBe(true);

    // Omitting them entirely is accepted too (Server Action normalises to '').
    const omitted = machineInputSchema(M).safeParse(machineBase);
    expect(omitted.success).toBe(true);

    // What the brief said to KEEP required:
    // - name (the card/listing label)...
    expectInvalid(
      machineInputSchema(M).safeParse({ ...machineBase, nameEn: '' }),
      'nameEn'
    );
    expectInvalid(
      machineInputSchema(M).safeParse({
        ...machineBase,
        nameEn: 'x'.repeat(30),
        nameAr: 'n',
      }),
      'nameAr'
    );
    // - ...and the short description (the machine page's lead paragraph and
    //   meta description), which keeps its min-10 rule.
    expectInvalid(
      machineInputSchema(M).safeParse({
        ...machineBase,
        descriptionAr: '',
        descriptionEn: '',
        specsAr: '',
        specsEn: '',
        shortDescriptionEn: 'short',
      }),
      'shortDescriptionEn'
    );
    expectInvalid(
      machineInputSchema(M).safeParse({ ...machineBase, categoryId: '' }),
      'categoryId'
    );
  });

  it('news image is optional and reaches the action as submitted', () => {
    const newsBase = {
      slug: 'news-x',
      titleAr: 'خبر',
      titleEn: 'News',
      bodyAr: 'نص كاف يزيد عن عشرة أحرف.',
      bodyEn: 'Body long enough, over ten chars.',
      publishedAt: '2026-09-01',
    };
    expect(
      newsInputSchema(M).safeParse({ ...newsBase, image: '' }).success
    ).toBe(true);
    expect(
      newsInputSchema(M).safeParse({
        ...newsBase,
        image: 'javascript:alert(1)',
      }).success
    ).toBe(true);
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

  it('both photos are carried as submitted (allowlist is server-side)', () => {
    // Presence is required here; the Cloudinary rule needs the stored row, so
    // it runs in `updateShowcase`/`createShowcase`. This pins that a submitted
    // value is not silently transformed on its way to the action.
    const urlCases: Array<[string, boolean]> = [
      ['https://res.cloudinary.com/test-cloud/image/upload/a.jpg', true],
      ['javascript:alert(1)', true],
      ['/images/seed/x.jpg', true],
      ['', false],
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
  // Minimal valid identity, so each rule below is exercised one failure at
  // a time.
  const agent = {
    countryAr: 'مصر',
    countryEn: 'Egypt',
    nameAr: 'المكتب الرئيسي',
    nameEn: 'Head office',
  };

  it('requires countries and both names', () => {
    expect(agentInputSchema(M).safeParse(agent).success).toBe(true);
    expectInvalid(
      agentInputSchema(M).safeParse({
        ...agent,
        countryAr: 'x',
      }),
      'countryAr'
    );
    expectInvalid(
      agentInputSchema(M).safeParse({ ...agent, nameEn: '' }),
      'nameEn'
    );
    expectInvalid(
      agentInputSchema(M).safeParse({ ...agent, nameAr: undefined }),
      'nameAr'
    );
  });

  it('bounds agent names at 2 and 120 characters', () => {
    expect(
      agentInputSchema(M).safeParse({ ...agent, nameEn: 'A' }).success
    ).toBe(false);
    expect(
      agentInputSchema(M).safeParse({ ...agent, nameEn: 'Ab' }).success
    ).toBe(true);
    expect(
      agentInputSchema(M).safeParse({ ...agent, nameEn: 'N'.repeat(120) })
        .success
    ).toBe(true);
    expectInvalid(
      agentInputSchema(M).safeParse({ ...agent, nameEn: 'N'.repeat(121) }),
      'nameEn'
    );
  });

  it('accepts a website only as an absolute http(s) URL without credentials', () => {
    const parse = (websiteUrl: string | undefined) =>
      agentInputSchema(M).safeParse({ ...agent, websiteUrl });

    function check(
      result: { success: boolean; data?: unknown },
      expected: string | null | undefined
    ) {
      expect(result.success).toBe(true);
      assert(result.success && result.data !== undefined);
      expect((result.data as { websiteUrl: string | null }).websiteUrl).toBe(
        expected
      );
    }

    check(parse('https://colina.example.com'), 'https://colina.example.com');
    // http is allowed (same rule as every internal URL field).
    check(
      parse('http://colina.example.com/agents'),
      'http://colina.example.com/agents'
    );
    // Whitespace outside the URL is trimmed, not rejected.
    check(
      parse('  https://colina.example.com  '),
      'https://colina.example.com'
    );
    // Missing and blank mean "no website" — the transform normalizes both
    // to null, which is what the Server Action writes.
    check(parse(undefined), null);
    expect(
      (
        agentInputSchema(M).safeParse({ ...agent, websiteUrl: '' }).data as
          | { websiteUrl: string | null }
          | undefined
      )?.websiteUrl
    ).toBe(null);

    for (const bad of [
      'not a url',
      'colina.example.com',
      'ftp://colina.example.com',
      'javascript:alert(1)',
      'https://user:secret@colina.example.com',
      'https://ops@colina.example.com',
    ]) {
      expectInvalid(parse(bad), 'websiteUrl');
    }
  });

  it('caps the website URL length before parsing it', () => {
    const long = `https://colina.example.com/${'x'.repeat(2048)}`;
    expectInvalid(
      agentInputSchema(M).safeParse({ ...agent, websiteUrl: long }),
      'websiteUrl'
    );
    expect(
      agentInputSchema(M).safeParse({ ...agent, websiteUrl: long }).error
        ?.issues[0]
    ).toMatchObject({ path: ['websiteUrl'] });
  });

  it('carries the logo as submitted; optional and allowlisted server-side', () => {
    // Stage 4c: the schema keeps the field optional (blank is "no logo yet")
    // and leaves the Cloudinary decision to the action, which can read the
    // stored value for the unchanged-legacy case.
    const withLogo = agentInputSchema(M).safeParse({
      ...agent,
      logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
    });
    expect(withLogo.success).toBe(true);
    expect((withLogo.data as { logoUrl: string }).logoUrl).toBe(
      'https://res.cloudinary.com/demo/image/upload/logo.png'
    );

    expect(
      agentInputSchema(M).safeParse({ ...agent, logoUrl: 'ftp://nope' }).success
    ).toBe(true);
    // Absent or blank is the normal "no logo yet" state.
    expect(agentInputSchema(M).safeParse({ ...agent }).success).toBe(true);
    expect(
      agentInputSchema(M).safeParse({ ...agent, logoUrl: '' }).success
    ).toBe(true);
  });

  it('takes isPublished as an optional boolean', () => {
    expect(
      agentInputSchema(M).safeParse({ ...agent, isPublished: false }).success
    ).toBe(true);
    expect(
      agentInputSchema(M).safeParse({ ...agent, isPublished: true }).success
    ).toBe(true);
    // Missing stays valid — the update keeps whatever the row has stored.
    expect(agentInputSchema(M).safeParse({ ...agent }).success).toBe(true);
    expectInvalid(
      agentInputSchema(M).safeParse({ ...agent, isPublished: 'yes' }),
      'isPublished'
    );
  });
});
