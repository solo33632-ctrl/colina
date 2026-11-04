import type { AuditChange } from './audit-changes';

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
};

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

  const changes = value.changes.filter(isAuditChange);

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

/**
 * The stored entity is `<Prefix>:<identifier>`; lead deletion is the lone
 * space-separated form (`Lead requested=…`).
 */
export function auditEntityType(entity: string): string {
  const colon = entity.indexOf(':');
  if (colon > 0) {
    return entity.slice(0, colon);
  }
  const space = entity.indexOf(' ');
  return space > 0 ? entity.slice(0, space) : entity;
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
