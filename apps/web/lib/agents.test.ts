import { describe, expect, it } from 'vitest';
import { buildAgentGroups, sanitizeAgent, type AgentContact } from './agents';

function agent(
  overrides: Partial<AgentContact> & { id: string }
): AgentContact {
  return {
    countryEn: 'Egypt',
    countryAr: 'مصر',
    cityEn: null,
    cityAr: null,
    addressEn: null,
    addressAr: null,
    phone: null,
    email: null,
    ...overrides,
  };
}

describe('sanitizeAgent', () => {
  it('trims every field and turns blanks into null', () => {
    expect(
      sanitizeAgent({
        id: 'a1',
        countryEn: '  Egypt ',
        countryAr: ' مصر ',
        cityEn: ' Cairo ',
        cityAr: '   ',
        addressEn: null,
        addressAr: ' 12th industrial zone   ',
        phone: '  +20 100 123 4567  ',
        email: ' Sales@Example.COM ',
      })
    ).toEqual({
      id: 'a1',
      countryEn: 'Egypt',
      countryAr: 'مصر',
      cityEn: 'Cairo',
      cityAr: 'Cairo',
      addressEn: '12th industrial zone',
      addressAr: '12th industrial zone',
      phone: '+20 100 123 4567',
      email: 'Sales@Example.COM',
    });
  });

  it.each([
    'abc',
    '12345',
    '+20 100 123 4567/8',
    ''.padEnd(31, '1'),
  ])('drops the unusable phone %j', (phone) => {
    const sanitized = sanitizeAgent({
      id: 'a1',
      countryEn: 'Egypt',
      countryAr: 'مصر',
      cityEn: null,
      cityAr: null,
      addressEn: null,
      addressAr: null,
      phone,
      email: null,
    });
    expect(sanitized?.phone).toBeNull();
  });

  it.each(['not-an-email', 'info@', 'protocol:evil@example.com'])(
    'drops the unusable email %j',
    (email) => {
      const sanitized = sanitizeAgent({
        id: 'a1',
        countryEn: 'Egypt',
        countryAr: 'مصر',
        cityEn: null,
        cityAr: null,
        addressEn: null,
        addressAr: null,
        phone: null,
        email,
      });
      expect(sanitized?.email).toBeNull();
    }
  );

  it('falls back to the other language for a blank country side', () => {
    const sanitized = sanitizeAgent({
      id: 'a1',
      countryEn: '  ',
      countryAr: 'مصر',
      cityEn: '  ',
      cityAr: 'القاهرة',
      addressEn: null,
      addressAr: null,
      phone: null,
      email: null,
    });
    expect(sanitized).toMatchObject({
      countryEn: 'مصر',
      countryAr: 'مصر',
      cityEn: 'القاهرة',
      cityAr: 'القاهرة',
    });
  });

  it('drops the row when both country names are blank', () => {
    expect(
      sanitizeAgent({
        id: 'a1',
        countryEn: '   ',
        countryAr: '',
        cityEn: null,
        cityAr: null,
        addressEn: null,
        addressAr: null,
        phone: null,
        email: null,
      })
    ).toBeNull();
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

  it('breaks same-city ties by id, deterministically', () => {
    const groups = buildAgentGroups(
      [
        agent({ id: 'a2', cityEn: 'Cairo' }),
        agent({ id: 'a1', cityEn: 'Cairo' }),
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
