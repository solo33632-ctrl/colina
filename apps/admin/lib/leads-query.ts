import { isLeadStatus, type LeadStatus } from './lead-status';

// Pure query/param logic for the leads inbox.
//
// The list is a merge of two Prisma models (ContactMessage and
// MaintenanceRequest), and a machine quote is a MaintenanceRequest whose
// `machineModel` carries the `Machine Name (slug)` reference the public quote
// panel writes. Keeping the parsing, classification, counting and pagination
// here — with no Prisma, next-intl or React imports — makes every rule
// unit-testable and leaves `lib/leads.ts` with only the two database reads.

export const LEADS_PAGE_SIZE = 20;

export const LEAD_TYPES = ['all', 'contact', 'maintenance', 'quote'] as const;
export type LeadType = (typeof LEAD_TYPES)[number];
export type LeadKind = Exclude<LeadType, 'all'>;
export type LeadDetailKind = 'contact' | 'maintenance';

export type LeadListFilters = {
  type: LeadType;
  status?: LeadStatus;
  query: string;
  /** Validated `YYYY-MM-DD`, inclusive. */
  from?: string;
  /** Validated `YYYY-MM-DD`, inclusive. */
  to?: string;
  page: number;
};

export type LeadListParams = {
  type?: string;
  status?: string;
  q?: string;
  from?: string;
  to?: string;
  page?: string;
};

/** The fields either lead table must provide for the shared list. */
export type LeadSource = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  message: string;
  status: LeadStatus;
  createdAt: Date;
};

export type ContactLeadSource = LeadSource;

export type MaintenanceLeadSource = LeadSource & {
  company: string | null;
  machineModel: string | null;
};

export type LeadListRow = {
  kind: LeadKind;
  /** The detail route's `[kind]`: a quote is still stored as a maintenance row. */
  detailKind: LeadDetailKind;
  id: string;
  name: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  machine: string | null;
  subject: string;
  status: LeadStatus;
  createdAt: Date;
};

export function parseLeadType(value: string | undefined): LeadType {
  return value !== undefined &&
    (LEAD_TYPES as readonly string[]).includes(value)
    ? (value as LeadType)
    : 'all';
}

export function parseLeadStatusFilter(
  value: string | undefined
): LeadStatus | undefined {
  return value !== undefined && isLeadStatus(value) ? value : undefined;
}

/** 1-based page; junk and non-positive values fall back to the first. */
export function parseLeadPage(value: string | undefined): number {
  const page = Number.parseInt(value ?? '', 10);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

const DATE_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validated `YYYY-MM-DD` or `undefined`.
 *
 * The round-trip through `Date.UTC` rejects impossible calendar dates
 * (`2026-02-31`) rather than letting the platform roll them into March.
 */
export function parseDateFilter(value: string | undefined): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  const trimmed = value.trim();
  const match = DATE_PARAM.exec(trimmed);
  if (!match) {
    return undefined;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return undefined;
  }
  return trimmed;
}

export function parseLeadListFilters(params: LeadListParams): LeadListFilters {
  return {
    type: parseLeadType(params.type),
    status: parseLeadStatusFilter(params.status),
    query: (params.q ?? '').trim(),
    from: parseDateFilter(params.from),
    to: parseDateFilter(params.to),
    page: parseLeadPage(params.page),
  };
}

export function hasActiveLeadFilters(filters: LeadListFilters): boolean {
  return (
    filters.type !== 'all' ||
    filters.status !== undefined ||
    filters.query.length > 0 ||
    filters.from !== undefined ||
    filters.to !== undefined
  );
}

/** UTC day boundaries; `to` is inclusive, so the query uses the next midnight. */
export function leadDateRange(filters: LeadListFilters): {
  gte?: Date;
  lt?: Date;
} {
  const start = filters.from
    ? new Date(`${filters.from}T00:00:00.000Z`)
    : undefined;
  const end = filters.to ? new Date(`${filters.to}T00:00:00.000Z`) : undefined;
  return {
    ...(start ? { gte: start } : {}),
    ...(end ? { lt: new Date(end.getTime() + 24 * 60 * 60 * 1000) } : {}),
  };
}

/**
 * The public quote panel writes `${name} (${slug})` into `machineModel`.
 *
 * There is no separate quote table, so this reference is the discriminator:
 * a maintenance request typed by hand has a model name, while a machine quote
 * always ends with the stable machine slug in parentheses.
 */
export function quoteMachineSlug(
  machineModel: string | null | undefined
): string | null {
  const value = (machineModel ?? '').trim();
  const match = /^.+ \(([a-z0-9]+(?:-[a-z0-9]+)*)\)$/i.exec(value);
  return match ? match[1].toLowerCase() : null;
}

/**
 * `knownMachineSlugs` is the exact check the server uses: a machine quote
 * names a machine that still exists. Without it (pure tests, or a future
 * caller without the catalogue), a hyphenated slug is the fallback signal.
 */
export function isQuoteReference(
  machineModel: string | null | undefined,
  knownMachineSlugs?: ReadonlySet<string>
): boolean {
  const slug = quoteMachineSlug(machineModel);
  if (slug === null) {
    return false;
  }
  return knownMachineSlugs ? knownMachineSlugs.has(slug) : slug.includes('-');
}

export function maintenanceLeadKind(
  machineModel: string | null | undefined,
  knownMachineSlugs?: ReadonlySet<string>
): 'maintenance' | 'quote' {
  return isQuoteReference(machineModel, knownMachineSlugs)
    ? 'quote'
    : 'maintenance';
}

function clean(value: string | null | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}

/** First non-empty line, used as the contact row's subject. */
export function messageSubject(message: string): string {
  const lines = message.split(/\r?\n/);
  return (lines.find((line) => line.trim() !== '') ?? '').trim();
}

export function toLeadRows(
  contacts: ContactLeadSource[],
  requests: MaintenanceLeadSource[],
  knownMachineSlugs?: ReadonlySet<string>
): LeadListRow[] {
  const rows: LeadListRow[] = [
    ...contacts.map((row) => ({
      kind: 'contact' as const,
      detailKind: 'contact' as const,
      id: row.id,
      name: row.name,
      company: null,
      phone: clean(row.phone),
      email: clean(row.email),
      machine: null,
      subject: messageSubject(row.message),
      status: row.status,
      createdAt: row.createdAt,
    })),
    ...requests.map((row) => {
      const machine = clean(row.machineModel);
      return {
        kind: maintenanceLeadKind(machine, knownMachineSlugs),
        detailKind: 'maintenance' as const,
        id: row.id,
        name: row.name,
        company: clean(row.company),
        phone: clean(row.phone),
        email: clean(row.email),
        machine,
        subject: machine ?? messageSubject(row.message),
        status: row.status,
        createdAt: row.createdAt,
      };
    }),
  ];

  return rows.sort(
    (a, b) =>
      b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id)
  );
}

export function countLeadRows(rows: LeadListRow[]): Record<LeadType, number> {
  const counts: Record<LeadType, number> = {
    all: rows.length,
    contact: 0,
    maintenance: 0,
    quote: 0,
  };
  for (const row of rows) {
    counts[row.kind] += 1;
  }
  return counts;
}

export function filterLeadRows(
  rows: LeadListRow[],
  type: LeadType
): LeadListRow[] {
  return type === 'all' ? rows : rows.filter((row) => row.kind === type);
}

export type LeadPage = {
  rows: LeadListRow[];
  page: number;
  total: number;
  totalPages: number;
};

/** Slices one page, pinning an out-of-range page to the last real page. */
export function paginateLeadRows(
  rows: LeadListRow[],
  requestedPage: number,
  pageSize = LEADS_PAGE_SIZE
): LeadPage {
  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = Math.min(Math.max(1, requestedPage), totalPages);
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page,
    total,
    totalPages,
  };
}

export function leadListHref(
  filters: LeadListFilters,
  overrides: Partial<LeadListFilters> = {}
): string {
  const next = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (next.type !== 'all') params.set('type', next.type);
  if (next.status) params.set('status', next.status);
  if (next.query) params.set('q', next.query);
  if (next.from) params.set('from', next.from);
  if (next.to) params.set('to', next.to);
  if (next.page > 1) params.set('page', String(next.page));
  const query = params.toString();
  return query ? `/leads?${query}` : '/leads';
}
