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
  auditEntityType,
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
