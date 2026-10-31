import { describe, expect, it } from 'vitest';
import {
  countLeadRows,
  filterLeadRows,
  hasActiveLeadFilters,
  isQuoteReference,
  leadDateRange,
  leadListHref,
  maintenanceLeadKind,
  messageSubject,
  paginateLeadRows,
  parseDateFilter,
  parseLeadListFilters,
  parseLeadPage,
  parseLeadStatusFilter,
  parseLeadType,
  toLeadRows,
  type LeadListRow,
  type LeadSource,
  type MaintenanceLeadSource,
} from './leads-query';

const contact = (
  overrides: Partial<LeadSource> & Pick<LeadSource, 'id' | 'createdAt'>
): LeadSource => ({
  name: 'Contact Person',
  phone: '+20 100 000 0000',
  email: 'contact@example.com',
  message: 'A contact message long enough to be a lead.',
  status: 'NEW',
  ...overrides,
});

const request = (
  overrides: Partial<MaintenanceLeadSource> &
    Pick<MaintenanceLeadSource, 'id' | 'createdAt'>
): MaintenanceLeadSource => ({
  name: 'Request Person',
  company: 'Example Foods',
  phone: '+20 100 000 0001',
  email: 'request@example.com',
  machineModel: 'Colina Pro 1000',
  message: 'A maintenance request long enough to be a lead.',
  status: 'NEW',
  ...overrides,
});

const row = (
  overrides: Partial<LeadListRow> & Pick<LeadListRow, 'id'>
): LeadListRow => ({
  kind: 'contact',
  detailKind: 'contact',
  name: 'Person',
  company: null,
  phone: null,
  email: null,
  machine: null,
  subject: 'Subject',
  status: 'NEW',
  createdAt: new Date('2026-03-01T10:00:00.000Z'),
  ...overrides,
});

describe('parseLeadType', () => {
  it('accepts the four tabs', () => {
    for (const type of ['all', 'contact', 'maintenance', 'quote'] as const) {
      expect(parseLeadType(type)).toBe(type);
    }
  });

  it('falls back to all for an absent or unknown value', () => {
    for (const value of [undefined, '', 'quotes', 'CONTACT', 'all ']) {
      expect(parseLeadType(value), String(value)).toBe('all');
    }
  });
});

describe('parseLeadStatusFilter', () => {
  it('accepts the stored codes and rejects everything else', () => {
    expect(parseLeadStatusFilter('NEW')).toBe('NEW');
    expect(parseLeadStatusFilter('IN_PROGRESS')).toBe('IN_PROGRESS');
    expect(parseLeadStatusFilter('RESOLVED')).toBe('RESOLVED');
    for (const value of [undefined, '', 'new', 'PENDING', 'RESOLVED ']) {
      expect(parseLeadStatusFilter(value), String(value)).toBeUndefined();
    }
  });
});

describe('parseLeadPage', () => {
  it('accepts a positive page and falls back to the first', () => {
    expect(parseLeadPage('3')).toBe(3);
    for (const value of [undefined, '', '0', '-2', 'two', '1.5']) {
      expect(parseLeadPage(value), String(value)).toBe(1);
    }
  });
});

describe('parseDateFilter', () => {
  it('keeps a valid calendar date', () => {
    expect(parseDateFilter('2026-03-18')).toBe('2026-03-18');
    expect(parseDateFilter(' 2026-03-18 ')).toBe('2026-03-18');
  });

  it('rejects impossible dates and malformed values', () => {
    for (const value of [
      undefined,
      '',
      '2026-3-18',
      '2026-02-31',
      '2026-13-01',
      '2026-00-10',
      '18-03-2026',
      'today',
    ]) {
      expect(parseDateFilter(value), String(value)).toBeUndefined();
    }
  });
});

describe('parseLeadListFilters', () => {
  it('trims search and applies defaults', () => {
    expect(parseLeadListFilters({})).toEqual({
      type: 'all',
      status: undefined,
      query: '',
      from: undefined,
      to: undefined,
      page: 1,
    });
    expect(
      parseLeadListFilters({
        type: 'quote',
        status: 'NEW',
        q: '  colina  ',
        from: '2026-03-01',
        to: '2026-03-18',
        page: '2',
      })
    ).toEqual({
      type: 'quote',
      status: 'NEW',
      query: 'colina',
      from: '2026-03-01',
      to: '2026-03-18',
      page: 2,
    });
  });
});

describe('hasActiveLeadFilters', () => {
  it('is false only for the untouched inbox', () => {
    expect(hasActiveLeadFilters(parseLeadListFilters({}))).toBe(false);
    expect(hasActiveLeadFilters(parseLeadListFilters({ type: 'quote' }))).toBe(
      true
    );
    expect(hasActiveLeadFilters(parseLeadListFilters({ status: 'NEW' }))).toBe(
      true
    );
    expect(hasActiveLeadFilters(parseLeadListFilters({ q: 'acme' }))).toBe(
      true
    );
    expect(
      hasActiveLeadFilters(parseLeadListFilters({ from: '2026-03-01' }))
    ).toBe(true);
  });
});

describe('leadDateRange', () => {
  it('uses an inclusive end date by ending at the next UTC midnight', () => {
    const range = leadDateRange(
      parseLeadListFilters({ from: '2026-03-01', to: '2026-03-02' })
    );
    expect(range.gte?.toISOString()).toBe('2026-03-01T00:00:00.000Z');
    expect(range.lt?.toISOString()).toBe('2026-03-03T00:00:00.000Z');
  });

  it('omits an absent side', () => {
    expect(leadDateRange(parseLeadListFilters({}))).toEqual({});
    expect(leadDateRange(parseLeadListFilters({ to: '2026-03-02' }))).toEqual({
      lt: new Date('2026-03-03T00:00:00.000Z'),
    });
  });
});

describe('quote classification', () => {
  const slugs = new Set(['colina-pro-1000', 'mixer', 'linia-2']);

  it('recognises the public quote panel reference', () => {
    expect(isQuoteReference('Colina Pro 1000 (colina-pro-1000)', slugs)).toBe(
      true
    );
    expect(isQuoteReference('  Mixer (mixer)  ', slugs)).toBe(true);
    expect(isQuoteReference('Linia (linia-2)', slugs)).toBe(true);
  });

  it('requires the slug to be a real machine when the catalogue is known', () => {
    expect(isQuoteReference('Line 2 (old)', slugs)).toBe(false);
    expect(isQuoteReference('Colina Pro 1000 (removed-machine)', slugs)).toBe(
      false
    );
  });

  it('leaves hand-typed machines as maintenance requests', () => {
    expect(isQuoteReference('Colina Pro 1000', slugs)).toBe(false);
    expect(isQuoteReference('Line 2 (old)', slugs)).toBe(false);
    expect(isQuoteReference('')).toBe(false);
    expect(isQuoteReference(null)).toBe(false);
    expect(isQuoteReference(undefined)).toBe(false);
    expect(maintenanceLeadKind('Colina Pro 1000', slugs)).toBe('maintenance');
    expect(
      maintenanceLeadKind('Colina Pro 1000 (colina-pro-1000)', slugs)
    ).toBe('quote');
  });

  it('falls back to the slug shape when no catalogue is supplied', () => {
    expect(isQuoteReference('Colina Pro 1000 (colina-pro-1000)')).toBe(true);
    expect(isQuoteReference('Line 2 (old)')).toBe(false);
  });
});

describe('messageSubject', () => {
  it('takes the first non-empty line', () => {
    expect(messageSubject('\n  First line  \nSecond line')).toBe('First line');
    expect(messageSubject('One line')).toBe('One line');
    expect(messageSubject('')).toBe('');
  });
});

describe('toLeadRows', () => {
  it('merges, classifies and sorts newest first', () => {
    const rows = toLeadRows(
      [
        contact({
          id: 'old-contact',
          createdAt: new Date('2026-03-01T09:00:00.000Z'),
        }),
        contact({
          id: 'new-contact',
          createdAt: new Date('2026-03-03T09:00:00.000Z'),
        }),
      ],
      [
        request({
          id: 'maintenance',
          machineModel: 'Seed Machine',
          createdAt: new Date('2026-03-02T09:00:00.000Z'),
        }),
        request({
          id: 'quote',
          machineModel: 'Colina Pro 1000 (colina-pro-1000)',
          createdAt: new Date('2026-03-04T09:00:00.000Z'),
        }),
      ],
      new Set(['colina-pro-1000'])
    );

    expect(rows.map((entry) => entry.id)).toEqual([
      'quote',
      'new-contact',
      'maintenance',
      'old-contact',
    ]);
    expect(rows.map((entry) => entry.kind)).toEqual([
      'quote',
      'contact',
      'maintenance',
      'contact',
    ]);
    expect(rows.find((entry) => entry.id === 'quote')?.detailKind).toBe(
      'maintenance'
    );
  });

  it('normalizes empty optional fields and builds subjects', () => {
    const [contactRow, requestRow] = toLeadRows(
      [
        contact({
          id: 'contact',
          phone: '',
          email: '',
          message: '  First line\nSecond line ',
          createdAt: new Date('2026-03-02T09:00:00.000Z'),
        }),
      ],
      [
        request({
          id: 'request',
          company: '',
          machineModel: '',
          message: 'Machine description\nMore detail',
          createdAt: new Date('2026-03-01T09:00:00.000Z'),
        }),
      ]
    );

    expect(contactRow).toMatchObject({
      kind: 'contact',
      company: null,
      phone: null,
      email: null,
      machine: null,
      subject: 'First line',
    });
    expect(requestRow).toMatchObject({
      kind: 'maintenance',
      company: null,
      machine: null,
      subject: 'Machine description',
    });
  });
});

describe('count and filter rows', () => {
  const rows = [
    row({ id: 'a', kind: 'contact' }),
    row({ id: 'b', kind: 'maintenance' }),
    row({ id: 'c', kind: 'quote' }),
    row({ id: 'd', kind: 'quote' }),
  ];

  it('counts every tab', () => {
    expect(countLeadRows(rows)).toEqual({
      all: 4,
      contact: 1,
      maintenance: 1,
      quote: 2,
    });
  });

  it('filters one tab without touching the source list', () => {
    expect(filterLeadRows(rows, 'all')).toHaveLength(4);
    expect(filterLeadRows(rows, 'quote').map((entry) => entry.id)).toEqual([
      'c',
      'd',
    ]);
    expect(filterLeadRows(rows, 'contact').map((entry) => entry.id)).toEqual([
      'a',
    ]);
  });
});

describe('paginateLeadRows', () => {
  const rows = Array.from({ length: 45 }, (_, index) =>
    row({ id: `row-${index}` })
  );

  it('returns 20 rows per page and the real page count', () => {
    const first = paginateLeadRows(rows, 1);
    expect(first.rows).toHaveLength(20);
    expect(first.total).toBe(45);
    expect(first.totalPages).toBe(3);
    expect(first.page).toBe(1);

    const last = paginateLeadRows(rows, 3);
    expect(last.rows).toHaveLength(5);
    expect(last.rows[0].id).toBe('row-40');
  });

  it('pins a page past the end to the last real page', () => {
    expect(paginateLeadRows(rows, 99)).toMatchObject({
      page: 3,
      totalPages: 3,
    });
    expect(paginateLeadRows(rows, 0).page).toBe(1);
  });

  it('keeps an empty list on page one', () => {
    expect(paginateLeadRows([], 4)).toEqual({
      rows: [],
      page: 1,
      total: 0,
      totalPages: 1,
    });
  });
});

describe('leadListHref', () => {
  const filters = parseLeadListFilters({
    type: 'quote',
    status: 'NEW',
    q: 'colina pro',
    from: '2026-03-01',
    to: '2026-03-18',
    page: '2',
  });

  it('keeps every active filter and the page', () => {
    expect(leadListHref(filters)).toBe(
      '/leads?type=quote&status=NEW&q=colina+pro&from=2026-03-01&to=2026-03-18&page=2'
    );
  });

  it('drops defaults and lets a tab reset the page', () => {
    expect(leadListHref(parseLeadListFilters({}))).toBe('/leads');
    expect(leadListHref(filters, { type: 'all', page: 1 })).toBe(
      '/leads?status=NEW&q=colina+pro&from=2026-03-01&to=2026-03-18'
    );
  });
});
