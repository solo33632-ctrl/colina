import { describe, expect, it } from 'vitest';
import {
  buildAgentGroups,
  sanitizeAgent,
  sanitizeAgentLogo,
  sanitizeAgentWebsite,
  type AgentContact,
} from './agents';

type AgentRowInput = Parameters<typeof sanitizeAgent>[0];

/** A complete, publishable row; every case overrides only what it exercises. */
function row(overrides: Partial<AgentRowInput> = {}): AgentRowInput {
  return {
    id: 'a1',
    countryEn: 'Egypt',
    countryAr: 'مصر',
    nameEn: null,
    nameAr: null,
    cityEn: null,
    cityAr: null,
    addressEn: null,
    addressAr: null,
    phone: null,
    email: null,
    websiteUrl: null,
    logoUrl: null,
    isPublished: true,
    ...overrides,
  };
}

function agent(
  overrides: Partial<AgentContact> & { id: string }
): AgentContact {
  return {
    countryEn: 'Egypt',
    countryAr: 'مصر',
    nameEn: null,
    nameAr: null,
    cityEn: null,
    cityAr: null,
    addressEn: null,
    addressAr: null,
    phone: null,
    email: null,
    websiteUrl: null,
    websiteHost: null,
    logoUrl: null,
    ...overrides,
  };
}

describe('sanitizeAgent', () => {
  it('trims every field and turns blanks into null', () => {
    expect(
      sanitizeAgent(
        row({
          countryEn: '  Egypt ',
          countryAr: ' مصر ',
          nameEn: '  Nile Office ',
          nameAr: '   ',
          cityEn: ' Cairo ',
          cityAr: '   ',
          addressEn: null,
          addressAr: ' 12th industrial zone   ',
          phone: '  +20 100 123 4567  ',
          email: ' Sales@Example.COM ',
          websiteUrl: '  https://nile.example.com/about  ',
          logoUrl: '  https://cdn.example.com/logo.png  ',
        })
      )
    ).toEqual({
      id: 'a1',
      countryEn: 'Egypt',
      countryAr: 'مصر',
      nameEn: 'Nile Office',
      nameAr: 'Nile Office',
      cityEn: 'Cairo',
      cityAr: 'Cairo',
      addressEn: '12th industrial zone',
      addressAr: '12th industrial zone',
      phone: '+20 100 123 4567',
      email: 'Sales@Example.COM',
      websiteUrl: 'https://nile.example.com/about',
      websiteHost: 'nile.example.com',
      logoUrl: 'https://cdn.example.com/logo.png',
    });
  });

  it.each([
    'abc',
    '12345',
    '+20 100 123 4567/8',
    ''.padEnd(31, '1'),
  ])('drops the unusable phone %j', (phone) => {
    expect(sanitizeAgent(row({ phone }))?.phone).toBeNull();
  });

  it.each(['not-an-email', 'info@', 'protocol:evil@example.com'])(
    'drops the unusable email %j',
    (email) => {
      expect(sanitizeAgent(row({ email }))?.email).toBeNull();
    }
  );

  it('falls back to the other language for a blank country/name side', () => {
    const sanitized = sanitizeAgent(
      row({
        countryEn: '  ',
        countryAr: 'مصر',
        nameEn: '   ',
        nameAr: 'مكتب القاهرة',
        cityEn: '  ',
        cityAr: 'القاهرة',
      })
    );
    expect(sanitized).toMatchObject({
      countryEn: 'مصر',
      countryAr: 'مصر',
      nameEn: 'مكتب القاهرة',
      nameAr: 'مكتب القاهرة',
      cityEn: 'القاهرة',
      cityAr: 'القاهرة',
    });
  });

  it('keeps a nameless row: the name stays null and the card falls back', () => {
    const sanitized = sanitizeAgent(row({ nameEn: ' ', nameAr: null }));
    expect(sanitized?.nameEn).toBeNull();
    expect(sanitized?.nameAr).toBeNull();
  });

  it('drops the row when both country names are blank', () => {
    expect(sanitizeAgent(row({ countryEn: '   ', countryAr: '' }))).toBeNull();
  });

  it('drops an unpublished row even if the query let it through', () => {
    expect(sanitizeAgent(row({ isPublished: false }))).toBeNull();
    expect(sanitizeAgent(row({ isPublished: true }))).not.toBeNull();
  });

  it('drops a bad website and a non-https logo stored on the row', () => {
    const sanitized = sanitizeAgent(
      row({
        websiteUrl: 'javascript:alert(1)',
        logoUrl: 'http://insecure.example.com/logo.png',
      })
    );
    expect(sanitized?.websiteUrl).toBeNull();
    expect(sanitized?.websiteHost).toBeNull();
    expect(sanitized?.logoUrl).toBeNull();
  });
});

describe('sanitizeAgentWebsite', () => {
  it.each([
    ['https://nile.example.com', 'nile.example.com'],
    ['http://nile.example.com/about?x=1', 'nile.example.com'],
    ['https://nile.example.com:8443', 'nile.example.com:8443'],
  ])('accepts the absolute URL %j with host %j', (value, host) => {
    expect(sanitizeAgentWebsite(value)).toEqual({ url: value, host });
  });

  it.each([
    '',
    '   ',
    'nile.example.com',
    '/about',
    'ftp://nile.example.com',
    'javascript:alert(1)',
    'data:text/html,hi',
    'https://user:secret@nile.example.com',
  ])('rejects %j', (value) => {
    expect(sanitizeAgentWebsite(value)).toBeNull();
  });
});

describe('sanitizeAgentLogo', () => {
  it('accepts an absolute https URL', () => {
    expect(sanitizeAgentLogo('https://cdn.example.com/logo.png')).toBe(
      'https://cdn.example.com/logo.png'
    );
  });

  it.each([
    'http://cdn.example.com/logo.png',
    'data:image/png;base64,abc',
    'javascript:alert(1)',
    '/logo.png',
    'https://user:secret@cdn.example.com/logo.png',
  ])('rejects %j', (value) => {
    expect(sanitizeAgentLogo(value)).toBeNull();
  });
});

describe('buildAgentGroups', () => {
  it('groups by the country pair, case-insensitively', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'a1' }),
        agent({ id: 'a2', countryEn: 'egypt' }),
        agent({ id: 'b1', countryEn: 'Qatar', countryAr: 'قطر' }),
      ],
      'en'
    );
    expect(groups.map((group) => group.countryEn)).toEqual(['Egypt', 'Qatar']);
    expect(groups[0].agents.map((row) => row.id)).toEqual(['a1', 'a2']);
  });

  it('sorts countries alphabetically by the EN name', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'a1', countryEn: 'Qatar', countryAr: 'قطر' }),
        agent({ id: 'a2', countryEn: 'Egypt', countryAr: 'مصر' }),
        agent({ id: 'a3', countryEn: 'Oman', countryAr: 'عمان' }),
      ],
      'en'
    );
    expect(groups.map((group) => group.countryEn)).toEqual([
      'Egypt',
      'Oman',
      'Qatar',
    ]);
  });

  it('sorts countries alphabetically by the AR name', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'a1', countryEn: 'Qatar', countryAr: 'قطر' }),
        agent({ id: 'a2', countryEn: 'Egypt', countryAr: 'مصر' }),
        agent({ id: 'a3', countryEn: 'Oman', countryAr: 'عمان' }),
      ],
      'ar'
    );
    // Arabic alphabet order: ع comes before ق, which comes before م.
    expect(groups.map((group) => group.countryAr)).toEqual([
      'عمان',
      'قطر',
      'مصر',
    ]);
  });

  it('sorts agents inside a country by the EN city, city-less last', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'no-city', cityEn: null, cityAr: null }),
        agent({ id: 'z', cityEn: 'Zagazig' }),
        agent({ id: 'm', cityEn: 'Minya' }),
        agent({ id: 'a', cityEn: 'Aswan' }),
      ],
      'en'
    );
    expect(groups[0].agents.map((row) => row.id)).toEqual([
      'a',
      'm',
      'z',
      'no-city',
    ]);
  });

  it('sorts agents inside a country by the AR city, city-less last', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'no-city', cityEn: null, cityAr: null }),
        agent({ id: 'q', cityEn: null, cityAr: 'قنا' }),
        agent({ id: 't', cityEn: null, cityAr: 'طنطا' }),
      ],
      'ar'
    );
    // Arabic alphabet: ط comes before ق.
    expect(groups[0].agents.map((row) => row.id)).toEqual([
      't',
      'q',
      'no-city',
    ]);
  });

  it('sorts same-city agents by the localized name, nameless last', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'z', cityEn: 'Cairo', nameEn: 'Zed Office' }),
        agent({ id: 'nameless', cityEn: 'Cairo', nameEn: null }),
        agent({ id: 'a', cityEn: 'Cairo', nameEn: 'Ahmed Office' }),
      ],
      'en'
    );
    expect(groups[0].agents.map((row) => row.id)).toEqual([
      'a',
      'z',
      'nameless',
    ]);
  });

  it('uses the Arabic name for the same-city order on the AR page', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'z', cityAr: 'القاهرة', nameAr: 'مكتب زين' }),
        agent({ id: 'a', cityAr: 'القاهرة', nameAr: 'مكتب ألف' }),
      ],
      'ar'
    );
    // Arabic alphabet: أ (alef) comes before ز (zay).
    expect(groups[0].agents.map((row) => row.id)).toEqual(['a', 'z']);
  });

  it('breaks same-city, same-name ties by id, deterministically', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'a2', cityEn: 'Cairo', nameEn: 'Office' }),
        agent({ id: 'a1', cityEn: 'Cairo', nameEn: 'Office' }),
      ],
      'en'
    );
    expect(groups[0].agents.map((row) => row.id)).toEqual(['a1', 'a2']);
  });

  it('does not mutate the input array', () => {
    const input = [
      agent({ id: 'a2', cityEn: 'Cairo' }),
      agent({ id: 'a1', countryEn: 'Oman', countryAr: 'عمان' }),
    ];
    buildAgentGroups(input, 'en');
    expect(input.map((row) => row.id)).toEqual(['a2', 'a1']);
  });
});
