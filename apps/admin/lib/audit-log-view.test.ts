import { describe, expect, it } from 'vitest';

import en from '../messages/en.json';
import ar from '../messages/ar.json';
import {
  ADMIN_USER_AUDIT_SPEC,
  AGENT_AUDIT_SPEC,
  CATEGORY_AUDIT_SPEC,
  LEAD_DELETE_AUDIT_SPEC,
  LEAD_STATUS_AUDIT_SPEC,
  MAINTENANCE_CATEGORY_AUDIT_SPEC,
  MAINTENANCE_SERVICE_AUDIT_SPEC,
  MACHINE_AUDIT_SPEC,
  NEWS_AUDIT_SPEC,
  PARTNER_AUDIT_SPEC,
  SHOWCASE_AUDIT_SPEC,
  SITE_SETTINGS_AUDIT_SPEC,
  type AuditEntitySpec,
} from './audit-changes';
import {
  AUDIT_ACTIONS,
  AUDIT_ACTION_SENTENCES,
  AUDIT_ENTITY_MESSAGE_KEYS,
  AUDIT_ENTITY_TYPES,
  AUDIT_NAMELESS_ACTIONS,
  auditEntityLabelKey,
  auditEntityType,
  auditEntrySentence,
  parseAuditDetails,
} from './audit-log-view';

// The audit page resolves every display string by key at render time, so a
// missing key silently degrades to a raw code. These tests fail the build
// instead, for both locales.

const enAudit = en.AuditLog;
const arAudit = ar.AuditLog;

const SPECS: AuditEntitySpec[] = [
  MACHINE_AUDIT_SPEC,
  CATEGORY_AUDIT_SPEC,
  PARTNER_AUDIT_SPEC,
  AGENT_AUDIT_SPEC,
  NEWS_AUDIT_SPEC,
  MAINTENANCE_CATEGORY_AUDIT_SPEC,
  MAINTENANCE_SERVICE_AUDIT_SPEC,
  SHOWCASE_AUDIT_SPEC,
  SITE_SETTINGS_AUDIT_SPEC,
  LEAD_STATUS_AUDIT_SPEC,
  LEAD_DELETE_AUDIT_SPEC,
  ADMIN_USER_AUDIT_SPEC,
];

describe('audit page display metadata', () => {
  it('has a translated sentence for every action code in both locales', () => {
    for (const action of AUDIT_ACTIONS) {
      const key = AUDIT_ACTION_SENTENCES[action];
      expect(key, `${action} has no sentence key`).toBeDefined();
      expect(
        enAudit.actions[key as keyof typeof enAudit.actions],
        `en actions.${key}`
      ).toBeDefined();
      expect(
        arAudit.actions[key as keyof typeof arAudit.actions],
        `ar actions.${key}`
      ).toBeDefined();
    }
  });

  it('has a translated entity badge for every filterable entity', () => {
    for (const entityType of AUDIT_ENTITY_TYPES) {
      const key = AUDIT_ENTITY_MESSAGE_KEYS[entityType];
      expect(key, `${entityType} has no message key`).toBeDefined();
      expect(
        enAudit.entities[key as keyof typeof enAudit.entities],
        `en entities.${key}`
      ).toBeDefined();
      expect(
        arAudit.entities[key as keyof typeof arAudit.entities],
        `ar entities.${key}`
      ).toBeDefined();
    }
  });

  it('has a translated field label for every allowlisted field', () => {
    for (const spec of SPECS) {
      for (const fieldSpec of Object.values(spec.fields)) {
        const key = fieldSpec.labelKey;
        expect(
          enAudit.fields[key as keyof typeof enAudit.fields],
          `en fields.${key}`
        ).toBeDefined();
        expect(
          arAudit.fields[key as keyof typeof arAudit.fields],
          `ar fields.${key}`
        ).toBeDefined();
      }
    }
  });

  it('renders settings and lead sentences without a name', () => {
    expect([...AUDIT_NAMELESS_ACTIONS].sort()).toEqual([
      'DELETE',
      'LEAD_STATUS_UPDATE',
      'SETTINGS_UPDATE',
    ]);
    for (const action of AUDIT_NAMELESS_ACTIONS) {
      const key = AUDIT_ACTION_SENTENCES[action];
      expect(
        String(enAudit.actions[key as keyof typeof enAudit.actions])
      ).not.toContain('{name}');
      expect(
        String(arAudit.actions[key as keyof typeof arAudit.actions])
      ).not.toContain('{name}');
    }
  });

  it('reads the entity prefix even when an id contains a colon', () => {
    expect(auditEntityType('NewsPost:hello')).toBe('NewsPost');
    expect(auditEntityType('SiteSettings:main')).toBe('SiteSettings');
    expect(
      auditEntityType(
        'Lead requested=1 deleted=1 skipped=0 items=contact:lead-1@2026-01-01'
      )
    ).toBe('Lead');
    expect(auditEntityType('NoSeparator')).toBe('NoSeparator');
  });

  it('resolves a sentence for named and nameless rows in both locales', () => {
    const details = {
      changes: [],
      label: { en: 'Acme partner', ar: 'شريك أكمي' },
    };

    expect(auditEntrySentence('PARTNER_UPDATE', details, 'en')).toEqual({
      key: 'partnerUpdate',
      name: 'Acme partner',
    });
    expect(auditEntrySentence('PARTNER_UPDATE', details, 'ar')).toEqual({
      key: 'partnerUpdate',
      name: 'شريك أكمي',
    });
    // A label missing one language falls back to the other.
    expect(
      auditEntrySentence(
        'PARTNER_UPDATE',
        { changes: [], label: { en: 'English only', ar: null } },
        'ar'
      )
    ).toEqual({ key: 'partnerUpdate', name: 'English only' });
    // Settings and leads have no safe display name, so they never need one.
    expect(auditEntrySentence('SETTINGS_UPDATE', null, 'en')).toEqual({
      key: 'settingsUpdate',
      name: null,
    });
    expect(auditEntrySentence('LEAD_STATUS_UPDATE', null, 'en')).toEqual({
      key: 'leadStatusUpdate',
      name: null,
    });
  });

  it('falls back to raw codes when no safe sentence exists', () => {
    expect(auditEntrySentence('PARTNER_UPDATE', null, 'en')).toBeNull();
    expect(
      auditEntrySentence('PARTNER_UPDATE', { changes: [] }, 'en')
    ).toBeNull();
    expect(auditEntrySentence('UNKNOWN_ACTION', null, 'en')).toBeNull();
  });

  it('maps a stored entity to its badge message key', () => {
    expect(auditEntityLabelKey('Machine:machine-1')).toBe('entities.machine');
    expect(auditEntityLabelKey('SiteSettings:main')).toBe('entities.settings');
    expect(
      auditEntityLabelKey(
        'Lead requested=1 deleted=1 skipped=0 items=contact:lead-1@2026-01-01'
      )
    ).toBe('entities.lead');
    expect(auditEntityLabelKey('Unknown:id')).toBeNull();
  });

  it('drops credential-looking fields even if a stored row contains them', () => {
    const details = parseAuditDetails({
      changes: [
        {
          field: 'whatsappNumber',
          labelKey: 'whatsappNumber',
          type: 'text',
          from: '201001111111',
          to: '201002222222',
        },
        {
          field: 'passwordHash',
          labelKey: 'passwordHash',
          type: 'text',
          from: 'old-hash',
          to: 'new-hash',
        },
        {
          field: 'labelKeyOnly',
          labelKey: 'sessionToken',
          type: 'text',
          from: 'old-token',
          to: 'new-token',
        },
      ],
    });

    expect(details?.changes.map((change) => change.field)).toEqual([
      'whatsappNumber',
    ]);
    expect(JSON.stringify(details)).not.toContain('hash');
    expect(JSON.stringify(details)).not.toContain('token');
  });
});
