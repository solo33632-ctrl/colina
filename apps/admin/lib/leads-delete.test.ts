import { describe, expect, it } from 'vitest';
import { leadDeleteAuditEntity } from './leads-delete';

const RECEIVED = new Date('2026-03-01T10:00:00.000Z');
const OTHER_RECEIVED = new Date('2026-03-02T11:30:00.000Z');

describe('leadDeleteAuditEntity', () => {
  it('names the entity Lead and lists every requested target in order', () => {
    expect(
      leadDeleteAuditEntity({
        requested: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'maintenance', id: 'request-1' },
        ],
        found: [
          { kind: 'maintenance', id: 'request-1', receivedAt: OTHER_RECEIVED },
          { kind: 'contact', id: 'contact-1', receivedAt: RECEIVED },
        ],
        deleted: 2,
      })
    ).toBe(
      'Lead requested=2 deleted=2 skipped=0 items=' +
        `contact:contact-1@${RECEIVED.toISOString()},` +
        `maintenance:request-1@${OTHER_RECEIVED.toISOString()}`
    );
  });

  it('marks ids that were not found as skipped', () => {
    expect(
      leadDeleteAuditEntity({
        requested: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'contact', id: 'missing' },
        ],
        found: [{ kind: 'contact', id: 'contact-1', receivedAt: RECEIVED }],
        deleted: 1,
      })
    ).toContain('skipped=1');
    expect(
      leadDeleteAuditEntity({
        requested: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'contact', id: 'missing' },
        ],
        found: [{ kind: 'contact', id: 'contact-1', receivedAt: RECEIVED }],
        deleted: 1,
      })
    ).toContain('items=contact:contact-1@2026-03-01T10:00:00.000Z,' +
      'contact:missing@skipped');
  });

  it('keeps an all-skipped call as one auditable event', () => {
    expect(
      leadDeleteAuditEntity({
        requested: [{ kind: 'maintenance', id: 'gone' }],
        found: [],
        deleted: 0,
      })
    ).toBe(
      'Lead requested=1 deleted=0 skipped=1 items=maintenance:gone@skipped'
    );
  });

  it('never serializes extra fields from a found row', () => {
    const foundWithPii = {
      kind: 'contact' as const,
      id: 'contact-1',
      receivedAt: RECEIVED,
      name: 'Private Name',
      phone: '+20 100 000 0000',
      email: 'private@example.com',
      message: 'Private message',
    };

    const entity = leadDeleteAuditEntity({
      requested: [{ kind: 'contact', id: 'contact-1' }],
      found: [foundWithPii],
      deleted: 1,
    });

    expect(entity).toBe(
      'Lead requested=1 deleted=1 skipped=0 items=contact:contact-1@2026-03-01T10:00:00.000Z'
    );
    for (const secret of [
      'Private Name',
      '+20 100 000 0000',
      'private@example.com',
      'Private message',
    ]) {
      expect(entity).not.toContain(secret);
    }
  });
});
