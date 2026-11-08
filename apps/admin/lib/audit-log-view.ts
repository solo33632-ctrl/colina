import { isForbiddenAuditField, type AuditChange } from './audit-changes';

/**
 * Display metadata for the audit log page.
 *
 * The page must stay readable when it meets rows written before Stage 38a:
 * those rows have no `details`, and some entity/action pairs belong to parts
 * of the admin that do not record diffs yet. The maps here are deliberately
 * finite; anything unknown falls back to the raw stored code.
 */

export const AUDIT_PAGE_SIZE = 25;

/** Sentinel value for the "deleted admin" option in the admin filter. */
export const AUDIT_DELETED_ADMIN_FILTER = 'deleted';

/** Every audited entity prefix that can be selected in the entity filter. */
export const AUDIT_ENTITY_TYPES = [
  'Machine',
  'MachineCategory',
  'Partner',
  'Agent',
  'NewsPost',
  'MaintenanceCategory',
  'MaintenanceService',
  'MaintenanceShowcase',
  'SiteSettings',
  'Lead',
  'ContactMessage',
  'MaintenanceRequest',
] as const;

export type AuditEntityType = (typeof AUDIT_ENTITY_TYPES)[number];

/** Entity prefix -> `AuditLog.entities.*` message key. */
export const AUDIT_ENTITY_MESSAGE_KEYS: Readonly<Record<string, string>> = {
  Machine: 'machine',
  MachineCategory: 'machineCategory',
  Partner: 'partner',
  Agent: 'agent',
  NewsPost: 'news',
  MaintenanceCategory: 'maintenanceCategory',
  MaintenanceService: 'maintenanceService',
  MaintenanceShowcase: 'showcase',
  SiteSettings: 'settings',
  Lead: 'lead',
  ContactMessage: 'contactMessage',
  MaintenanceRequest: 'maintenanceRequest',
};

/** Every action code the admin currently writes. */
export const AUDIT_ACTIONS = [
  'MACHINE_CREATE',
  'MACHINE_UPDATE',
  'MACHINE_DELETE',
  'CATEGORY_CREATE',
  'CATEGORY_UPDATE',
  'CATEGORY_DELETE',
  'PARTNER_CREATE',
  'PARTNER_UPDATE',
  'PARTNER_DELETE',
  'AGENT_CREATE',
  'AGENT_UPDATE',
  'AGENT_PUBLISH',
  'AGENT_HIDE',
  'AGENT_DELETE',
  'NEWS_CREATE',
  'NEWS_UPDATE',
  'NEWS_DELETE',
  'MAINTENANCE_CATEGORY_CREATE',
  'MAINTENANCE_CATEGORY_UPDATE',
  'MAINTENANCE_CATEGORY_DELETE',
  'MAINTENANCE_SHOWCASE_CREATE',
  'MAINTENANCE_SHOWCASE_UPDATE',
  'MAINTENANCE_SHOWCASE_DELETE',
  'SERVICE_CREATE',
  'SERVICE_UPDATE',
  'SERVICE_DELETE',
  'SETTINGS_UPDATE',
  'LEAD_STATUS_UPDATE',
  'DELETE',
] as const;

/**
 * Actions with a human sentence in `AuditLog.actions.*`. The template's only
 * placeholder is `{name}`; the filter options reuse it with that placeholder
 * removed. Actions without an entry deliberately render their stored code.
 */
export const AUDIT_ACTION_SENTENCES: Readonly<Record<string, string>> = {
  MACHINE_CREATE: 'machineCreate',
  MACHINE_UPDATE: 'machineUpdate',
  MACHINE_DELETE: 'machineDelete',
  CATEGORY_CREATE: 'categoryCreate',
  CATEGORY_UPDATE: 'categoryUpdate',
  CATEGORY_DELETE: 'categoryDelete',
  PARTNER_CREATE: 'partnerCreate',
  PARTNER_UPDATE: 'partnerUpdate',
  PARTNER_DELETE: 'partnerDelete',
  AGENT_CREATE: 'agentCreate',
  AGENT_UPDATE: 'agentUpdate',
  AGENT_PUBLISH: 'agentPublish',
  AGENT_HIDE: 'agentHide',
  AGENT_DELETE: 'agentDelete',
  NEWS_CREATE: 'newsCreate',
  NEWS_UPDATE: 'newsUpdate',
  NEWS_DELETE: 'newsDelete',
  MAINTENANCE_CATEGORY_CREATE: 'maintenanceCategoryCreate',
  MAINTENANCE_CATEGORY_UPDATE: 'maintenanceCategoryUpdate',
  MAINTENANCE_CATEGORY_DELETE: 'maintenanceCategoryDelete',
  MAINTENANCE_SHOWCASE_CREATE: 'showcaseCreate',
  MAINTENANCE_SHOWCASE_UPDATE: 'showcaseUpdate',
  MAINTENANCE_SHOWCASE_DELETE: 'showcaseDelete',
  SERVICE_CREATE: 'maintenanceServiceCreate',
  SERVICE_UPDATE: 'maintenanceServiceUpdate',
  SERVICE_DELETE: 'maintenanceServiceDelete',
  SETTINGS_UPDATE: 'settingsUpdate',
  LEAD_STATUS_UPDATE: 'leadStatusUpdate',
  DELETE: 'leadDelete',
};

/**
 * Actions whose sentence intentionally has no `{name}` placeholder. Site
 * settings and leads have no safe display name (a lead's name is the
 * visitor's personal data), so the page renders their sentence even when the
 * entry carries no label.
 */
export const AUDIT_NAMELESS_ACTIONS: ReadonlySet<string> = new Set([
  'SETTINGS_UPDATE',
  'LEAD_STATUS_UPDATE',
  'DELETE',
]);

export type AuditViewDetails = {
  changes: AuditChange[];
  label: { en: string | null; ar: string | null } | null;
};

const FIELD_TYPES: ReadonlySet<string> = new Set([
  'text',
  'longText',
  'url',
  'boolean',
  'number',
  'date',
  'imageUrl',
  'list',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAuditChange(value: unknown): value is AuditChange {
  return (
    isRecord(value) &&
    typeof value.field === 'string' &&
    typeof value.labelKey === 'string' &&
    typeof value.type === 'string' &&
    FIELD_TYPES.has(value.type) &&
    'from' in value &&
    'to' in value
  );
}

/**
 * Validates the stored JSON before the page renders it. A malformed payload
 * is treated exactly like a pre-Stage-38a row (no details), never like a
 * reason to throw.
 */
export function parseAuditDetails(value: unknown): AuditViewDetails | null {
  if (!isRecord(value) || !Array.isArray(value.changes)) {
    return null;
  }

  const changes = value.changes
    .filter(isAuditChange)
    // Defence in depth for the read side: the writers' allowlists already
    // refuse credential names, but a row written by an older build (or by
    // hand) must not be able to put a password/hash/token label on screen.
    .filter(
      (change) =>
        !isForbiddenAuditField(change.field) &&
        !isForbiddenAuditField(change.labelKey)
    );

  let label: AuditViewDetails['label'] = null;
  if (isRecord(value.label)) {
    const en = typeof value.label.en === 'string' ? value.label.en : null;
    const ar = typeof value.label.ar === 'string' ? value.label.ar : null;
    if (en !== null || ar !== null) {
      label = { en, ar };
    }
  }

  return { changes, label };
}

export type AuditEntrySentence = {
  /** `AuditLog.actions.*` key. */
  key: string;
  /** Localized record name, or `null` for the nameless actions. */
  name: string | null;
};

/**
 * Resolves an audit row to its human sentence, shared by the audit-log page
 * and the dashboard's "Recent activity" panel.
 *
 * Returns `null` when the row has no safe sentence: an unknown action, or a
 * named action whose stored details carry no label. Callers then keep the raw
 * action/entity codes, exactly like the audit log page always has.
 */
export function auditEntrySentence(
  action: string,
  details: unknown,
  locale: string
): AuditEntrySentence | null {
  const key = AUDIT_ACTION_SENTENCES[action];
  if (!key) {
    return null;
  }

  const label = parseAuditDetails(details)?.label ?? null;
  const name = label
    ? locale === 'ar'
      ? (label.ar ?? label.en)
      : (label.en ?? label.ar)
    : null;

  if (name === null && !AUDIT_NAMELESS_ACTIONS.has(action)) {
    return null;
  }

  return { key, name };
}

/**
 * Full `AuditLog.entities.*` message key for a stored entity, or `null` when
 * the prefix is unknown. Callers fall back to the raw prefix.
 */
export function auditEntityLabelKey(entity: string): string | null {
  const key = AUDIT_ENTITY_MESSAGE_KEYS[auditEntityType(entity)];
  return key ? `entities.${key}` : null;
}

/**
 * The stored entity is `<Prefix>:<identifier>`; lead deletion is the lone
 * space-separated form (`Lead requested=…`).
 */
export function auditEntityType(entity: string): string {
  const colon = entity.indexOf(':');
  const space = entity.indexOf(' ');
  // Whichever separator comes first is the real one: `NewsPost:x` has no
  // space, while a lead-delete entity starts with `Lead ` and only later
  // contains the colon of its first `contact:<id>` item.
  if (space > 0 && (colon < 0 || space < colon)) {
    return entity.slice(0, space);
  }
  if (colon > 0) {
    return entity.slice(0, colon);
  }
  return entity;
}

/**
 * Parses a `YYYY-MM-DD` input into an inclusive UTC day boundary. Invalid or
 * missing values are ignored rather than widening the filter.
 */
export function parseAuditDate(
  value: string | undefined,
  boundary: 'start' | 'end'
): Date | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const suffix = boundary === 'start' ? '00:00:00.000Z' : '23:59:59.999Z';
  const parsed = new Date(`${value}T${suffix}`);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}
