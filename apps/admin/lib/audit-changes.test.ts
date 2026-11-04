import { describe, expect, it } from 'vitest';
import {
  AGENT_AUDIT_SPEC,
  AUDIT_MAX_BYTES,
  AUDIT_MAX_CHANGES,
  AUDIT_TEXT_LIMIT,
  buildChanges,
  buildSnapshot,
  isForbiddenAuditField,
  type AuditEntitySpec,
  type AuditFieldSpec,
  type AuditTextValue,
} from './audit-changes';

const spec: AuditEntitySpec = {
  fields: {
    nameEn: { labelKey: 'nameEn', type: 'text' },
    nameAr: { labelKey: 'nameAr', type: 'text' },
    descriptionEn: { labelKey: 'descriptionEn', type: 'longText' },
    descriptionAr: { labelKey: 'descriptionAr', type: 'longText' },
    websiteUrl: { labelKey: 'websiteUrl', type: 'url' },
    logoUrl: { labelKey: 'logoUrl', type: 'imageUrl' },
    featured: { labelKey: 'featured', type: 'boolean' },
    position: { labelKey: 'position', type: 'number' },
    publishedAt: { labelKey: 'publishedAt', type: 'date' },
    images: { labelKey: 'images', type: 'list' },
  },
  snapshotFields: ['nameEn', 'nameAr'],
};

function storedText(value: unknown): AuditTextValue {
  return value as AuditTextValue;
}

describe('buildChanges', () => {
  it('returns no changes for identical rows', () => {
    const row = {
      nameEn: 'Nile',
      nameAr: 'النيل',
      descriptionEn: 'A machine',
      websiteUrl: 'https://example.com',
      logoUrl: 'https://cdn.example.com/logo.png',
      featured: true,
      position: 2,
      publishedAt: new Date('2026-01-02T03:04:05.000Z'),
      images: ['https://cdn.example.com/a.png'],
    };
    expect(buildChanges(row, { ...row }, spec)).toEqual({ changes: [] });
  });

  it('records exactly the changed field', () => {
    const details = buildChanges(
      { nameEn: 'Old', nameAr: 'قديم', descriptionEn: 'Same' },
      { nameEn: 'New', nameAr: 'قديم', descriptionEn: 'Same' },
      spec
    );
    expect(details.changes).toEqual([
      {
        field: 'nameEn',
        labelKey: 'nameEn',
        type: 'text',
        from: 'Old',
        to: 'New',
      },
    ]);
  });

  it('treats null, undefined and blank strings as the same empty value', () => {
    expect(
      buildChanges(
        { nameEn: null, nameAr: undefined, descriptionEn: '' },
        {
          nameEn: '',
          nameAr: '   ',
          descriptionEn: null,
        },
        spec
      ).changes
    ).toEqual([]);
  });

  it('trims text values before comparing and storing them', () => {
    expect(
      buildChanges({ nameEn: '  Nile ' }, { nameEn: 'Nile' }, spec).changes
    ).toEqual([]);
    expect(
      buildChanges({ nameEn: '-Nile-' }, { nameEn: '  Nile  ' }, spec).changes
    ).toMatchObject([{ from: '-Nile-', to: 'Nile' }]);
  });

  it('ignores fields that are not on the allowlist', () => {
    const details = buildChanges(
      { nameEn: 'Same', createdAt: new Date(0), internalNote: 'old' },
      { nameEn: 'Same', createdAt: new Date(1), internalNote: 'new' },
      spec
    );
    expect(details.changes).toEqual([]);
  });

  it('refuses credential-looking fields even when a spec lists them', () => {
    const leakySpec: AuditEntitySpec = {
      fields: {
        nameEn: { labelKey: 'nameEn', type: 'text' },
        password: { labelKey: 'password', type: 'text' },
        passwordHash: { labelKey: 'passwordHash', type: 'text' },
        apiToken: { labelKey: 'apiToken', type: 'text' },
        sessionToken: { labelKey: 'sessionToken', type: 'text' },
        jwtSecret: { labelKey: 'jwtSecret', type: 'text' },
        resetToken: { labelKey: 'resetToken', type: 'text' },
      },
    };

    const details = buildChanges(
      {
        nameEn: 'Old',
        password: 'old-password',
        passwordHash: 'old-hash',
        apiToken: 'old-token',
        sessionToken: 'old-session',
        jwtSecret: 'old-secret',
        resetToken: 'old-reset',
      },
      {
        nameEn: 'New',
        password: 'new-password',
        passwordHash: 'new-hash',
        apiToken: 'new-token',
        sessionToken: 'new-session',
        jwtSecret: 'new-secret',
        resetToken: 'new-reset',
      },
      leakySpec
    );

    expect(details.changes.map((change) => change.field)).toEqual(['nameEn']);
    const json = JSON.stringify(details);
    for (const secret of [
      'old-password',
      'new-password',
      'old-hash',
      'new-hash',
      'old-token',
      'new-token',
      'old-session',
      'new-session',
      'old-secret',
      'new-secret',
      'old-reset',
      'new-reset',
    ]) {
      expect(json).not.toContain(secret);
    }
  });

  it('truncates long text with an ellipsis and the original length', () => {
    const long = 'a'.repeat(AUDIT_TEXT_LIMIT + 23);
    const details = buildChanges(
      { descriptionEn: 'short' },
      { descriptionEn: long },
      spec
    );
    const change = details.changes[0];
    const stored = storedText(change.to);
    expect(stored.truncated).toBe(true);
    expect(stored.length).toBe(AUDIT_TEXT_LIMIT + 23);
    expect(stored.preview).toBe(`${'a'.repeat(AUDIT_TEXT_LIMIT)}…`);
    expect(stored.preview).toHaveLength(AUDIT_TEXT_LIMIT + 1);
    expect(storedText(change.from)).toEqual({
      preview: 'short',
      length: 5,
      truncated: false,
    });
  });

  it('detects a change past the 200-character preview window', () => {
    const head = 'a'.repeat(AUDIT_TEXT_LIMIT);
    const details = buildChanges(
      { descriptionEn: `${head}X` },
      { descriptionEn: `${head}Y` },
      spec
    );
    expect(details.changes).toHaveLength(1);
    // Both previews are intentionally identical; the stored length still
    // proves which revision was seen.
    expect(storedText(details.changes[0].from).length).toBe(
      AUDIT_TEXT_LIMIT + 1
    );
  });

  it('records a URL only when it passes the absolute http(s) rule', () => {
    const details = buildChanges(
      {
        websiteUrl: 'https://example.com/old',
        logoUrl: 'https://cdn.example.com/old.png',
      },
      {
        websiteUrl: 'http://example.com/new',
        logoUrl: 'https://cdn.example.com/new.png',
      },
      spec
    );
    expect(details.changes).toEqual([
      {
        field: 'websiteUrl',
        labelKey: 'websiteUrl',
        type: 'url',
        from: 'https://example.com/old',
        to: 'http://example.com/new',
      },
      {
        field: 'logoUrl',
        labelKey: 'logoUrl',
        type: 'imageUrl',
        from: 'https://cdn.example.com/old.png',
        to: 'https://cdn.example.com/new.png',
      },
    ]);
  });

  it('drops an invalid URL instead of recording it', () => {
    const details = buildChanges(
      { websiteUrl: 'https://example.com' },
      { websiteUrl: 'javascript:alert(1)' },
      spec
    );
    expect(details.changes).toEqual([
      {
        field: 'websiteUrl',
        labelKey: 'websiteUrl',
        type: 'url',
        from: 'https://example.com',
        to: null,
      },
    ]);
    expect(JSON.stringify(details)).not.toContain('javascript');
  });

  it('normalises booleans, numbers and dates', () => {
    const details = buildChanges(
      {
        featured: false,
        position: 1,
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        // Prisma always hands these over as real types; strings that are not
        // the field's type collapse to empty rather than being coerced.
        featured: true,
        position: 2,
        publishedAt: '2026-02-03T04:05:06.000Z',
      },
      spec
    );
    expect(details.changes).toEqual([
      {
        field: 'featured',
        labelKey: 'featured',
        type: 'boolean',
        from: false,
        to: true,
      },
      {
        field: 'position',
        labelKey: 'position',
        type: 'number',
        from: 1,
        to: 2,
      },
      {
        field: 'publishedAt',
        labelKey: 'publishedAt',
        type: 'date',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-02-03T04:05:06.000Z',
      },
    ]);
    expect(
      buildChanges({ position: '1' }, { position: 1 }, spec).changes
    ).toEqual([
      {
        field: 'position',
        labelKey: 'position',
        type: 'number',
        from: null,
        to: 1,
      },
    ]);
  });

  it('compares arrays by value and stores their item counts', () => {
    expect(
      buildChanges(
        { images: ['a', 'b', 'c'] },
        { images: ['a', 'b', 'c'] },
        spec
      ).changes
    ).toEqual([]);
    // Order is part of the value: a reorder is a real change.
    expect(
      buildChanges(
        { images: ['a', 'b'] },
        { images: ['b', 'a'] },
        spec
      ).changes
    ).toMatchObject([{ type: 'list', from: 2, to: 2 }]);

    expect(
      buildChanges(
        { images: ['a', 'b', 'c'] },
        { images: ['a', 'b', 'c', 'd'] },
        spec
      ).changes
    ).toEqual([
      {
        field: 'images',
        labelKey: 'images',
        type: 'list',
        from: 3,
        to: 4,
      },
    ]);
  });

  it('treats null, undefined and empty arrays as the same empty list', () => {
    expect(
      buildChanges(
        { images: null },
        { images: [] },
        spec
      ).changes
    ).toEqual([]);
    expect(
      buildChanges({ images: undefined }, { images: null }, spec).changes
    ).toEqual([]);
  });

  it(`caps the payload at ${AUDIT_MAX_CHANGES} changes`, () => {
    const fields: Record<string, AuditFieldSpec> = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (let index = 0; index < 40; index += 1) {
      const field = `field${index}`;
      fields[field] = { labelKey: field, type: 'text' };
      before[field] = `before-${index}`;
      after[field] = `after-${index}`;
    }

    const details = buildChanges(before, after, { fields });
    expect(details.changes).toHaveLength(AUDIT_MAX_CHANGES);
    expect(details.changes[0].field).toBe('field0');
    expect(details.changes.at(-1)?.field).toBe(
      `field${AUDIT_MAX_CHANGES - 1}`
    );
  });

  it(`caps the serialised payload at about ${AUDIT_MAX_BYTES} bytes`, () => {
    const fields: Record<string, AuditFieldSpec> = {};
    const before: Record<string, string> = {};
    const after: Record<string, string> = {};
    for (let index = 0; index < AUDIT_MAX_CHANGES; index += 1) {
      const field = `field${index}`;
      fields[field] = { labelKey: field, type: 'text' };
      before[field] = 'x'.repeat(400);
      after[field] = 'y'.repeat(700);
    }

    const details = buildChanges(before, after, { fields });
    expect(details.changes.length).toBeGreaterThan(0);
    expect(details.changes.length).toBeLessThan(AUDIT_MAX_CHANGES);
    expect(
      new TextEncoder().encode(JSON.stringify(details)).length
    ).toBeLessThanOrEqual(AUDIT_MAX_BYTES);
  });
});

describe('buildSnapshot', () => {
  it('records only the snapshot allowlist for a create', () => {
    const details = buildSnapshot(
      {
        nameEn: 'Nile',
        nameAr: 'النيل',
        slug: 'nile',
        id: 'cuid',
        passwordHash: 'never',
        createdAt: new Date(0),
      },
      {
        fields: {
          ...spec.fields,
          slug: { labelKey: 'slug', type: 'text' },
        },
        snapshotFields: ['nameEn', 'nameAr', 'slug'],
      }
    );

    expect(details.changes).toEqual([
      {
        field: 'nameEn',
        labelKey: 'nameEn',
        type: 'text',
        from: null,
        to: 'Nile',
      },
      {
        field: 'nameAr',
        labelKey: 'nameAr',
        type: 'text',
        from: null,
        to: 'النيل',
      },
      {
        field: 'slug',
        labelKey: 'slug',
        type: 'text',
        from: null,
        to: 'nile',
      },
    ]);
    expect(JSON.stringify(details)).not.toContain('never');
  });

  it('puts a delete snapshot in the Before column', () => {
    const details = buildSnapshot(
      { nameEn: 'Nile', nameAr: 'النيل' },
      spec,
      'delete'
    );
    expect(details.changes).toEqual([
      {
        field: 'nameEn',
        labelKey: 'nameEn',
        type: 'text',
        from: 'Nile',
        to: null,
      },
      {
        field: 'nameAr',
        labelKey: 'nameAr',
        type: 'text',
        from: 'النيل',
        to: null,
      },
    ]);
  });

  it('skips empty and forbidden snapshot values', () => {
    const details = buildSnapshot(
      { nameEn: '', nameAr: '   ', password: 'secret' },
      {
        fields: {
          ...spec.fields,
          password: { labelKey: 'password', type: 'text' },
        },
        snapshotFields: ['nameEn', 'nameAr', 'password'],
      }
    );
    expect(details.changes).toEqual([]);
  });

  it('never records a field that is not both allowlisted and snapshotted', () => {
    const details = buildSnapshot(
      {
        nameEn: 'Nile',
        nameAr: 'النيل',
        descriptionEn: 'full description',
        websiteUrl: 'https://example.com',
      },
      spec
    );
    expect(details.changes.map((change) => change.field)).toEqual([
      'nameEn',
      'nameAr',
    ]);
  });

  it('uses the shared agent spec to snapshot an identifying card', () => {
    const details = buildSnapshot(
      {
        nameEn: 'Cairo Office',
        nameAr: 'مكتب القاهرة',
        countryEn: 'Egypt',
        countryAr: 'مصر',
        cityEn: 'Cairo',
        cityAr: 'القاهرة',
        isPublished: true,
        email: 'secret@example.com',
      },
      AGENT_AUDIT_SPEC
    );
    expect(details.changes.map((change) => change.field)).toEqual([
      'nameEn',
      'nameAr',
      'countryEn',
      'countryAr',
      'cityEn',
      'cityAr',
      'isPublished',
    ]);
    expect(JSON.stringify(details)).not.toContain('secret@example.com');
  });
});

describe('isForbiddenAuditField', () => {
  it.each([
    'password',
    'passwordHash',
    'apiToken',
    'sessionToken',
    'jwtSecret',
    'cookieValue',
    'privateKey',
    'apiKey',
    'authorizationHeader',
  ])('refuses %j', (field) => {
    expect(isForbiddenAuditField(field)).toBe(true);
  });

  it.each(['nameEn', 'slug', 'descriptionAr', 'isPublished', 'publishedAt'])(
    'allows %j',
    (field) => {
      expect(isForbiddenAuditField(field)).toBe(false);
    }
  );
});
