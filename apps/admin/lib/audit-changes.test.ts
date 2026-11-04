import { describe, expect, it } from 'vitest';
import {
  ADMIN_USER_AUDIT_SPEC,
  AGENT_AUDIT_SPEC,
  AUDIT_MAX_BYTES,
  AUDIT_MAX_CHANGES,
  AUDIT_TEXT_LIMIT,
  LEAD_DELETE_AUDIT_SPEC,
  LEAD_STATUS_AUDIT_SPEC,
  MAINTENANCE_CATEGORY_AUDIT_SPEC,
  MAINTENANCE_SERVICE_AUDIT_SPEC,
  NEWS_AUDIT_SPEC,
  SHOWCASE_AUDIT_SPEC,
  SITE_SETTINGS_AUDIT_SPEC,
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
      buildChanges({ images: ['a', 'b'] }, { images: ['b', 'a'] }, spec).changes
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
      buildChanges({ images: null }, { images: [] }, spec).changes
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
    expect(details.changes.at(-1)?.field).toBe(`field${AUDIT_MAX_CHANGES - 1}`);
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

describe('remaining entity allowlists', () => {
  it('maintenance categories record only changed business fields', () => {
    const details = buildChanges(
      {
        nameEn: 'Bottling line',
        nameAr: 'خط التعبئة',
        slug: 'bottling-line',
        descriptionEn: 'Old line',
        descriptionAr: 'الخط القديم',
        imageUrl: 'https://cdn.example.com/old.png',
        sortOrder: 1,
        createdAt: new Date(0),
        internalNote: 'must-not-leak',
      },
      {
        nameEn: 'Bottling line',
        nameAr: 'خط التعبئة',
        slug: 'bottling-line',
        descriptionEn: 'New line',
        descriptionAr: 'الخط الجديد',
        imageUrl: 'https://cdn.example.com/new.png',
        sortOrder: 2,
        createdAt: new Date(1),
        internalNote: 'must-not-leak',
      },
      MAINTENANCE_CATEGORY_AUDIT_SPEC
    );

    expect(details.changes).toEqual([
      {
        field: 'descriptionEn',
        labelKey: 'descriptionEn',
        type: 'longText',
        from: {
          preview: 'Old line',
          length: 8,
          truncated: false,
        },
        to: {
          preview: 'New line',
          length: 8,
          truncated: false,
        },
      },
      {
        field: 'descriptionAr',
        labelKey: 'descriptionAr',
        type: 'longText',
        from: {
          preview: 'الخط القديم',
          length: 11,
          truncated: false,
        },
        to: {
          preview: 'الخط الجديد',
          length: 11,
          truncated: false,
        },
      },
      {
        field: 'imageUrl',
        labelKey: 'image',
        type: 'imageUrl',
        from: 'https://cdn.example.com/old.png',
        to: 'https://cdn.example.com/new.png',
      },
      {
        field: 'sortOrder',
        labelKey: 'sortOrder',
        type: 'number',
        from: 1,
        to: 2,
      },
    ]);
    expect(details.label).toEqual({
      en: 'Bottling line',
      ar: 'خط التعبئة',
    });
    expect(JSON.stringify(details)).not.toContain('must-not-leak');
  });

  it('maintenance categories treat null and blank as the same value', () => {
    expect(
      buildChanges(
        {
          descriptionEn: null,
          descriptionAr: undefined,
          imageUrl: '',
        },
        {
          descriptionEn: '   ',
          descriptionAr: null,
          imageUrl: null,
        },
        MAINTENANCE_CATEGORY_AUDIT_SPEC
      ).changes
    ).toEqual([]);
  });

  it('news posts record title/body/slug/image/date and truncate long bodies', () => {
    const longBody = 'n'.repeat(AUDIT_TEXT_LIMIT + 5);
    const details = buildChanges(
      {
        titleEn: 'Old title',
        titleAr: 'العنوان القديم',
        slug: 'old-slug',
        bodyEn: 'Old body',
        bodyAr: 'النص القديم',
        image: 'https://cdn.example.com/old.png',
        publishedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
      {
        titleEn: 'New title',
        titleAr: 'العنوان القديم',
        slug: 'new-slug',
        bodyEn: longBody,
        bodyAr: 'النص القديم',
        image: 'https://cdn.example.com/new.png',
        publishedAt: '2026-02-03T04:05:06.000Z',
      },
      NEWS_AUDIT_SPEC
    );

    expect(details.changes.map((change) => change.field)).toEqual([
      'titleEn',
      'slug',
      'bodyEn',
      'image',
      'publishedAt',
    ]);
    const body = storedText(details.changes[2].to);
    expect(body.truncated).toBe(true);
    expect(body.length).toBe(AUDIT_TEXT_LIMIT + 5);
    expect(details.label).toEqual({ en: 'New title', ar: 'العنوان القديم' });
    expect(
      buildChanges(
        { bodyEn: '', titleAr: null },
        { bodyEn: '   ', titleAr: undefined },
        NEWS_AUDIT_SPEC
      ).changes
    ).toEqual([]);
  });

  it('maintenance services record scope and icon as closed fields', () => {
    const details = buildChanges(
      {
        titleEn: 'Installation',
        titleAr: 'التركيب',
        slug: 'installation',
        descriptionEn: 'Old description',
        descriptionAr: 'الوصف القديم',
        scopeEn: 'Old scope',
        scopeAr: 'النطاق القديم',
        icon: 'wrench',
        passwordHash: 'must-not-leak',
      },
      {
        titleEn: 'Installation',
        titleAr: 'التركيب',
        slug: 'installation',
        descriptionEn: 'Old description',
        descriptionAr: 'الوصف القديم',
        scopeEn: 'New scope',
        scopeAr: 'النطاق الجديد',
        icon: 'gear',
        passwordHash: 'must-not-leak',
      },
      MAINTENANCE_SERVICE_AUDIT_SPEC
    );

    expect(details.changes.map((change) => change.field)).toEqual([
      'scopeEn',
      'scopeAr',
      'icon',
    ]);
    expect(details.label).toEqual({ en: 'Installation', ar: 'التركيب' });
    expect(JSON.stringify(details)).not.toContain('must-not-leak');
  });

  it('showcase items record the category name and the before/after photos', () => {
    const details = buildChanges(
      {
        nameEn: 'Filling job',
        nameAr: 'عمل التعبئة',
        category: 'Bottling line',
        descriptionEn: 'Old description',
        descriptionAr: 'الوصف القديم',
        beforeImageUrl: 'https://cdn.example.com/before-a.png',
        afterImageUrl: 'https://cdn.example.com/after-a.png',
        categoryId: 'cat-1',
        id: 'showcase-1',
      },
      {
        nameEn: 'Filling job',
        nameAr: 'عمل التعبئة',
        category: 'Packaging line',
        descriptionEn: 'New description',
        descriptionAr: 'الوصف الجديد',
        beforeImageUrl: 'https://cdn.example.com/before-b.png',
        afterImageUrl: 'https://cdn.example.com/after-b.png',
        categoryId: 'cat-2',
        id: 'showcase-1',
      },
      SHOWCASE_AUDIT_SPEC
    );

    expect(details.changes.map((change) => change.field)).toEqual([
      'category',
      'descriptionEn',
      'descriptionAr',
      'beforeImageUrl',
      'afterImageUrl',
    ]);
    const json = JSON.stringify(details);
    expect(json).not.toContain('cat-1');
    expect(json).not.toContain('cat-2');
    expect(json).not.toContain('showcase-1');
    expect(details.label).toEqual({
      en: 'Filling job',
      ar: 'عمل التعبئة',
    });
  });

  it('site settings record business contact fields and ignore unknown columns', () => {
    const details = buildChanges(
      {
        whatsappNumber: '+20 100 111 1111',
        whatsappMessageEn: 'Old greeting',
        whatsappMessageAr: 'التحية القديمة',
        contactPhone: '+20 100 222 2222',
        contactEmail: 'old@example.com',
        factoryAddressEn: 'Old address',
        factoryAddressAr: 'العنوان القديم',
        workingHoursEn: '9-5',
        workingHoursAr: '٩-٥',
        mapsUrl: 'https://maps.example.com/old',
        apiKey: 'must-not-leak',
        passwordHash: 'must-not-leak',
        latitude: 30.1,
        longitude: 31.2,
      },
      {
        whatsappNumber: '+20 100 333 3333',
        whatsappMessageEn: 'New greeting',
        whatsappMessageAr: 'التحية الجديدة',
        contactPhone: '+20 100 444 4444',
        contactEmail: 'new@example.com',
        factoryAddressEn: 'New address',
        factoryAddressAr: 'العنوان الجديد',
        workingHoursEn: '10-6',
        workingHoursAr: '١٠-٦',
        mapsUrl: 'https://maps.example.com/new',
        apiKey: 'must-not-leak',
        passwordHash: 'must-not-leak',
        latitude: 31.1,
        longitude: 32.2,
      },
      SITE_SETTINGS_AUDIT_SPEC
    );

    expect(details.changes.map((change) => change.field)).toEqual([
      'whatsappNumber',
      'whatsappMessageEn',
      'whatsappMessageAr',
      'contactPhone',
      'contactEmail',
      'factoryAddressEn',
      'factoryAddressAr',
      'workingHoursEn',
      'workingHoursAr',
      'mapsUrl',
    ]);
    expect(details.label).toBeUndefined();
    const json = JSON.stringify(details);
    expect(json).not.toContain('must-not-leak');
    expect(json).not.toContain('latitude');
    expect(json).not.toContain('longitude');
  });

  it('lead status changes record only the status diff', () => {
    const details = buildChanges(
      {
        status: 'NEW',
        name: 'Private Contact Name',
        phone: '+20 100 000 0000',
        email: 'private@example.com',
        message: 'Private message body',
      },
      {
        status: 'RESOLVED',
        name: 'Private Contact Name',
        phone: '+20 100 000 0000',
        email: 'private@example.com',
        message: 'Private message body',
      },
      LEAD_STATUS_AUDIT_SPEC
    );

    expect(details.changes).toEqual([
      {
        field: 'status',
        labelKey: 'status',
        type: 'text',
        from: 'NEW',
        to: 'RESOLVED',
      },
    ]);
    expect(details.label).toBeUndefined();
    const json = JSON.stringify(details);
    for (const pii of [
      'Private Contact Name',
      '+20 100 000 0000',
      'private@example.com',
      'Private message body',
    ]) {
      expect(json).not.toContain(pii);
    }
  });

  it('lead deletes snapshot counts only', () => {
    const details = buildSnapshot(
      {
        requested: 3,
        deleted: 2,
        skipped: 1,
        name: 'Private Contact Name',
        phone: '+20 100 000 0000',
        message: 'Private message body',
      },
      LEAD_DELETE_AUDIT_SPEC
    );

    expect(details.changes).toEqual([
      {
        field: 'requested',
        labelKey: 'requested',
        type: 'number',
        from: null,
        to: 3,
      },
      {
        field: 'deleted',
        labelKey: 'deleted',
        type: 'number',
        from: null,
        to: 2,
      },
      {
        field: 'skipped',
        labelKey: 'skipped',
        type: 'number',
        from: null,
        to: 1,
      },
    ]);
    const json = JSON.stringify(details);
    expect(json).not.toContain('Private Contact Name');
    expect(json).not.toContain('+20 100 000 0000');
    expect(json).not.toContain('Private message body');
  });

  it('admin-user specs may record role/active state but never credentials', () => {
    const details = buildChanges(
      {
        role: 'EDITOR',
        isActive: true,
        passwordHash: 'old-hash',
        passwordResetTokenHash: 'old-reset-hash',
      },
      {
        role: 'SUPER_ADMIN',
        isActive: false,
        passwordHash: 'new-hash',
        passwordResetTokenHash: 'new-reset-hash',
      },
      ADMIN_USER_AUDIT_SPEC
    );

    expect(details.changes.map((change) => change.field)).toEqual([
      'role',
      'isActive',
    ]);
    const json = JSON.stringify(details);
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('new-hash');
    expect(json).not.toContain('old-reset-hash');
    expect(json).not.toContain('new-reset-hash');
    expect(
      buildSnapshot(
        {
          role: 'EDITOR',
          passwordHash: 'never',
          passwordResetTokenHash: 'never',
        },
        ADMIN_USER_AUDIT_SPEC
      ).changes.map((change) => change.field)
    ).toEqual(['role']);
  });

  it('keeps long-text previews and the byte cap for the new specs', () => {
    const details = buildChanges(
      { bodyEn: 'a'.repeat(AUDIT_TEXT_LIMIT + 10) },
      { bodyEn: 'b'.repeat(AUDIT_TEXT_LIMIT + 10) },
      NEWS_AUDIT_SPEC
    );
    expect(storedText(details.changes[0].from).preview).toHaveLength(
      AUDIT_TEXT_LIMIT + 1
    );
    expect(
      new TextEncoder().encode(JSON.stringify(details)).length
    ).toBeLessThanOrEqual(AUDIT_MAX_BYTES);
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
