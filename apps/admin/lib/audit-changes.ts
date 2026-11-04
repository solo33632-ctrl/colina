import { isHttpUrl } from './schemas';

/**
 * Audit diffs: the "what changed" payload stored in `AuditLog.details`.
 *
 * The payload is written by Server Actions and read by the SUPER_ADMIN audit
 * page, so it has to be safe by construction:
 *
 * - Only fields named in an entity's explicit allowlist can ever be recorded.
 *   An entity spec is a closed list, not a filter over the database row.
 * - Fields whose names look like credentials are refused even if a spec
 *   accidentally lists them, so a password/hash/token can never reach the
 *   log through this helper.
 * - Values are normalised per type before comparison: empty strings and
 *   missing values are the same "empty", URLs must pass the same absolute
 *   http(s) rule the forms use, long text is truncated, and lists become
 *   item counts.
 * - The serialised result is capped at {@link AUDIT_MAX_CHANGES} changes and
 *   {@link AUDIT_MAX_BYTES} bytes; changes are dropped from the end rather
 *   than cutting JSON mid-object, so the stored value is always valid JSON.
 *
 * The helper never throws: a malformed value simply normalises to empty, and
 * callers store the returned object only after the write succeeded, inside
 * the same transaction.
 */

export const AUDIT_TEXT_LIMIT = 200;
export const AUDIT_MAX_CHANGES = 30;
export const AUDIT_MAX_BYTES = 8 * 1024;

export type AuditFieldType =
  | 'text'
  | 'longText'
  | 'url'
  | 'boolean'
  | 'number'
  | 'date'
  | 'imageUrl'
  | 'list';

export type AuditFieldSpec = {
  /** i18n key under `AuditLog.fields` used as the table's field label. */
  labelKey: string;
  type: AuditFieldType;
};

/** An explicit, closed allowlist for one audited entity. */
export type AuditEntitySpec = {
  fields: Readonly<Record<string, AuditFieldSpec>>;
  /**
   * Identifying fields recorded for create/delete. Every key must also exist
   * in `fields`; values are normalised under the same rules.
   */
  snapshotFields?: readonly string[];
  /**
   * The two columns that name the entity in the audit sentence and in the
   * free-text search. They are allowlisted `text` fields.
   */
  labelFields?: { en: string; ar: string };
};

/** The entity's display name, captured with every details payload. */
export type AuditEntityLabel = {
  en: string | null;
  ar: string | null;
};

/** A long value is stored as a preview plus its original length. */
export type AuditTextValue = {
  preview: string;
  length: number;
  truncated: boolean;
};

export type AuditStoredValue =
  | string
  | number
  | boolean
  | null
  | AuditTextValue;

export type AuditChange = {
  field: string;
  labelKey: string;
  type: AuditFieldType;
  /**
   * Normalised before value. For a create it is null; for a delete the
   * snapshot value sits in `from` and `to` is null.
   */
  from: AuditStoredValue;
  to: AuditStoredValue;
};

export type AuditDetails = {
  changes: AuditChange[];
  /**
   * The entity's name at the time of the action. Kept even when the name did
   * not change, so every row can render "Updated machine <name>" and the
   * page can search the label.
   */
  label?: AuditEntityLabel;
  /**
   * Lower-cased label text used by the free-text filter. Stored lower-case so
   * the database search needs no case-folding (JSON path filters have no
   * `mode`), and so old rows simply have no search text.
   */
  search?: string;
};

type AuditListValue = Array<string | number | boolean>;

type NormalizedValue = string | number | boolean | null | AuditListValue;

/**
 * Field names that are refused regardless of the spec. These cover the
 * AdminUser auth columns and the usual credential vocabulary; the audit log
 * must never become a second copy of a secret.
 */
const FORBIDDEN_FIELD_PATTERNS = [
  /pass(word|wd|phrase)?/i,
  /hash/i,
  /token/i,
  /secret/i,
  /session/i,
  /cookie/i,
  /salt/i,
  /\botp\b/i,
  /api[-_]?key/i,
  /private[-_]?key/i,
  /credential/i,
  /authorization/i,
];

export function isForbiddenAuditField(field: string): boolean {
  return FORBIDDEN_FIELD_PATTERNS.some((pattern) => pattern.test(field));
}

function readField(row: unknown, field: string): unknown {
  if (typeof row !== 'object' || row === null) {
    return undefined;
  }
  return (row as Record<string, unknown>)[field];
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}

function normalizeUrl(value: unknown): string | null {
  const trimmed = normalizeText(value);
  return trimmed !== null && isHttpUrl(trimmed) ? trimmed : null;
}

function normalizeDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  return null;
}

function normalizeList(value: unknown): AuditListValue {
  if (!Array.isArray(value)) {
    return [];
  }
  const items: AuditListValue = [];
  for (const item of value) {
    if (typeof item === 'string') {
      const trimmed = item.trim();
      if (trimmed !== '') {
        items.push(trimmed);
      }
    } else if (typeof item === 'number' && Number.isFinite(item)) {
      items.push(item);
    } else if (typeof item === 'boolean') {
      items.push(item);
    }
  }
  return items;
}

/** Normalises a raw field value; invalid values collapse to "empty". */
function normalizeValue(value: unknown, type: AuditFieldType): NormalizedValue {
  switch (type) {
    case 'text':
    case 'longText':
      return normalizeText(value);
    case 'url':
    case 'imageUrl':
      return normalizeUrl(value);
    case 'boolean':
      return typeof value === 'boolean' ? value : null;
    case 'number':
      return typeof value === 'number' && Number.isFinite(value) ? value : null;
    case 'date':
      return normalizeDate(value);
    case 'list':
      return normalizeList(value);
  }
}

function isEmptyValue(value: NormalizedValue): boolean {
  return (
    value === null ||
    value === '' ||
    (Array.isArray(value) && value.length === 0)
  );
}

function valuesEqual(before: NormalizedValue, after: NormalizedValue): boolean {
  if (Array.isArray(before) || Array.isArray(after)) {
    if (!Array.isArray(before) || !Array.isArray(after)) {
      return false;
    }
    return (
      before.length === after.length &&
      before.every((item, index) => Object.is(item, after[index]))
    );
  }
  return Object.is(before, after);
}

/** Turns a normalised value into the compact form stored in the log. */
function toStoredValue(
  value: NormalizedValue,
  type: AuditFieldType
): AuditStoredValue {
  if (type === 'list') {
    // Lists are summarised by item count: the log records "3 -> 4", not the
    // individual values (an image URL can be long and is not identifying).
    return Array.isArray(value) ? value.length : 0;
  }
  if (Array.isArray(value)) {
    // Lists are the only array-valued type; a value that reaches here under
    // another type is malformed and collapses to its count rather than
    // leaking a nested structure into the log.
    return value.length;
  }
  if (type === 'longText' && typeof value === 'string') {
    const truncated = value.length > AUDIT_TEXT_LIMIT;
    return {
      preview: truncated ? `${value.slice(0, AUDIT_TEXT_LIMIT)}…` : value,
      length: value.length,
      truncated,
    };
  }
  return value;
}

function jsonBytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

type AuditMeta = Pick<AuditDetails, 'label' | 'search'>;

function clipLabel(value: string): string {
  return value.length > AUDIT_TEXT_LIMIT
    ? value.slice(0, AUDIT_TEXT_LIMIT)
    : value;
}

/**
 * Captures the entity label. `after` wins when present so an update records
 * the new name; `before` is the fallback for fields the update left alone or
 * for a delete snapshot.
 */
function buildMeta(
  before: unknown,
  after: unknown,
  spec: AuditEntitySpec
): AuditMeta {
  if (!spec.labelFields) {
    return {};
  }
  const read = (field: string): string | null => {
    const afterValue = normalizeText(readField(after, field));
    if (afterValue !== null) {
      return clipLabel(afterValue);
    }
    const beforeValue = normalizeText(readField(before, field));
    return beforeValue === null ? null : clipLabel(beforeValue);
  };
  const en = read(spec.labelFields.en);
  const ar = read(spec.labelFields.ar);
  if (en === null && ar === null) {
    return {};
  }
  const search = [en, ar]
    .filter((value): value is string => value !== null)
    .join(' ')
    .toLowerCase();
  return {
    label: { en, ar },
    ...(search === '' ? {} : { search }),
  };
}

/**
 * Caps the payload: at most 30 changes and about 8 KB of JSON. When the cap
 * bites, whole changes are dropped from the end — never a partial object — so
 * the column always contains valid JSON the page can render. The label is
 * metadata; if it alone would exceed the cap it is dropped rather than
 * producing an oversized row.
 */
function capDetails(changes: AuditChange[], meta: AuditMeta): AuditDetails {
  const capped = changes.slice(0, AUDIT_MAX_CHANGES);
  while (
    capped.length > 0 &&
    jsonBytes({ changes: capped, ...meta }) > AUDIT_MAX_BYTES
  ) {
    capped.pop();
  }
  if (jsonBytes({ changes: capped, ...meta }) > AUDIT_MAX_BYTES) {
    return { changes: capped };
  }
  return { changes: capped, ...meta };
}

/**
 * Diffs the allowlisted fields of two rows.
 *
 * Only fields that really changed are returned. A field that is missing,
 * null or an empty string on both sides is unchanged. Fields outside the
 * spec, and fields with a forbidden name, are never inspected.
 */
export function buildChanges(
  before: unknown,
  after: unknown,
  spec: AuditEntitySpec
): AuditDetails {
  const changes: AuditChange[] = [];

  for (const [field, fieldSpec] of Object.entries(spec.fields)) {
    if (isForbiddenAuditField(field)) {
      continue;
    }
    const beforeValue = normalizeValue(
      readField(before, field),
      fieldSpec.type
    );
    const afterValue = normalizeValue(readField(after, field), fieldSpec.type);
    if (valuesEqual(beforeValue, afterValue)) {
      continue;
    }
    changes.push({
      field,
      labelKey: fieldSpec.labelKey,
      type: fieldSpec.type,
      from: toStoredValue(beforeValue, fieldSpec.type),
      to: toStoredValue(afterValue, fieldSpec.type),
    });
  }

  return capDetails(changes, buildMeta(before, after, spec));
}

/**
 * The identifying snapshot recorded for a create or delete.
 *
 * "Create" puts each value in the After column (Before is empty); "delete"
 * puts it in Before (After is empty). Only the spec's `snapshotFields` are
 * read, so a full database row cannot leak anything else.
 */
export function buildSnapshot(
  row: unknown,
  spec: AuditEntitySpec,
  mode: 'create' | 'delete' = 'create'
): AuditDetails {
  const changes: AuditChange[] = [];

  for (const field of spec.snapshotFields ?? []) {
    const fieldSpec = spec.fields[field];
    if (!fieldSpec || isForbiddenAuditField(field)) {
      continue;
    }
    const value = normalizeValue(readField(row, field), fieldSpec.type);
    if (isEmptyValue(value)) {
      continue;
    }
    const stored = toStoredValue(value, fieldSpec.type);
    changes.push({
      field,
      labelKey: fieldSpec.labelKey,
      type: fieldSpec.type,
      from: mode === 'delete' ? stored : null,
      to: mode === 'create' ? stored : null,
    });
  }

  return capDetails(changes, buildMeta(row, row, spec));
}

// ---------------------------------------------------------------------------
// Entity specs
//
// These are the ONLY fields the audit log can record for the four wired
// entities. They are deliberately narrow: no ids, timestamps, relations or
// auth columns, and nothing from the leads/contact tables. The label keys are
// shared with the audit page's `AuditLog.fields.*` messages.
// ---------------------------------------------------------------------------

export const MACHINE_AUDIT_SPEC: AuditEntitySpec = {
  fields: {
    nameEn: { labelKey: 'nameEn', type: 'text' },
    nameAr: { labelKey: 'nameAr', type: 'text' },
    slug: { labelKey: 'slug', type: 'text' },
    categorySlug: { labelKey: 'category', type: 'text' },
    shortDescriptionEn: { labelKey: 'shortDescriptionEn', type: 'longText' },
    shortDescriptionAr: { labelKey: 'shortDescriptionAr', type: 'longText' },
    descriptionEn: { labelKey: 'descriptionEn', type: 'longText' },
    descriptionAr: { labelKey: 'descriptionAr', type: 'longText' },
    specsEn: { labelKey: 'specsEn', type: 'longText' },
    specsAr: { labelKey: 'specsAr', type: 'longText' },
    datasheetUrl: { labelKey: 'datasheetUrl', type: 'url' },
    images: { labelKey: 'images', type: 'list' },
    relatedIds: { labelKey: 'relatedIds', type: 'list' },
  },
  snapshotFields: ['nameEn', 'nameAr', 'slug'],
  labelFields: { en: 'nameEn', ar: 'nameAr' },
};

export const CATEGORY_AUDIT_SPEC: AuditEntitySpec = {
  fields: {
    nameEn: { labelKey: 'nameEn', type: 'text' },
    nameAr: { labelKey: 'nameAr', type: 'text' },
    slug: { labelKey: 'slug', type: 'text' },
    descriptionEn: { labelKey: 'descriptionEn', type: 'longText' },
    descriptionAr: { labelKey: 'descriptionAr', type: 'longText' },
    image: { labelKey: 'image', type: 'imageUrl' },
  },
  snapshotFields: ['nameEn', 'nameAr', 'slug'],
  labelFields: { en: 'nameEn', ar: 'nameAr' },
};

export const PARTNER_AUDIT_SPEC: AuditEntitySpec = {
  fields: {
    nameEn: { labelKey: 'nameEn', type: 'text' },
    nameAr: { labelKey: 'nameAr', type: 'text' },
    logo: { labelKey: 'logo', type: 'imageUrl' },
  },
  snapshotFields: ['nameEn', 'nameAr'],
  labelFields: { en: 'nameEn', ar: 'nameAr' },
};

export const AGENT_AUDIT_SPEC: AuditEntitySpec = {
  fields: {
    countryEn: { labelKey: 'countryEn', type: 'text' },
    countryAr: { labelKey: 'countryAr', type: 'text' },
    nameEn: { labelKey: 'nameEn', type: 'text' },
    nameAr: { labelKey: 'nameAr', type: 'text' },
    cityEn: { labelKey: 'cityEn', type: 'text' },
    cityAr: { labelKey: 'cityAr', type: 'text' },
    addressEn: { labelKey: 'addressEn', type: 'longText' },
    addressAr: { labelKey: 'addressAr', type: 'longText' },
    phone: { labelKey: 'phone', type: 'text' },
    email: { labelKey: 'email', type: 'text' },
    websiteUrl: { labelKey: 'websiteUrl', type: 'url' },
    logoUrl: { labelKey: 'logoUrl', type: 'imageUrl' },
    isPublished: { labelKey: 'isPublished', type: 'boolean' },
  },
  snapshotFields: [
    'nameEn',
    'nameAr',
    'countryEn',
    'countryAr',
    'cityEn',
    'cityAr',
    'isPublished',
  ],
  labelFields: { en: 'nameEn', ar: 'nameAr' },
};
