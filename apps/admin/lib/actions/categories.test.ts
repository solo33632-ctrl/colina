import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createCategory, deleteCategory, updateCategory } from './categories';

vi.mock('@colina/db', () => {
  const txCategory = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = {
    create: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ machineCategory: txCategory, auditLog: txAuditLog })
    ),
    machineCategory: {
      findUnique: vi.fn(),
    },
  };
  (prisma as Record<string, unknown>).txCategory = txCategory;
  (prisma as Record<string, unknown>).txAuditLog = txAuditLog;
  return { prisma };
});

vi.mock('../admin-action', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `msg-${key}`),
}));

const SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
};

const VALID_INPUT = {
  nameAr: 'فئة الآلات',
  nameEn: 'Machine category',
  slug: 'machine-category',
  descriptionAr: 'وصف الفئة',
  descriptionEn: 'Category description',
  image: 'https://cdn.example.com/category.png',
};

const STORED_CATEGORY = {
  id: 'cat-1',
  nameAr: 'فئة الآلات',
  nameEn: 'Machine category',
  slug: 'machine-category',
  descriptionAr: 'وصف الفئة',
  descriptionEn: 'Category description',
  image: 'https://cdn.example.com/category.png',
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    category: mock.txCategory as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

const outerFindUnique = prisma.machineCategory
  .findUnique as unknown as ReturnType<typeof vi.fn>;
const findUnique = doubles().category.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().category.create.mockResolvedValue(STORED_CATEGORY);
  doubles().category.update.mockResolvedValue(STORED_CATEGORY);
  doubles().category.delete.mockResolvedValue(STORED_CATEGORY);
  doubles().auditLog.create.mockResolvedValue({});
  findUnique.mockResolvedValue(STORED_CATEGORY);
  outerFindUnique.mockResolvedValue({
    id: 'cat-1',
    slug: STORED_CATEGORY.slug,
    _count: { machines: 0 },
  });
});

describe('createCategory', () => {
  it('records an identifying snapshot and nothing else', async () => {
    doubles().category.create.mockResolvedValue({
      ...STORED_CATEGORY,
      descriptionEn: 'must-not-leak',
      image: 'https://cdn.example.com/secret.png',
      createdAt: new Date(0),
      passwordHash: 'must-not-leak',
    });

    const result = await createCategory(VALID_INPUT);

    expect(result).toEqual({ ok: true, slug: 'machine-category' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'CATEGORY_CREATE',
      entity: 'MachineCategory:machine-category',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Machine category',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'فئة الآلات',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: null,
          to: 'machine-category',
        },
      ],
      ...label('Machine category', 'فئة الآلات'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
    expect(JSON.stringify(data.details)).not.toContain('secret.png');
  });
});

describe('updateCategory', () => {
  it('records the changed fields, including a truncated description', async () => {
    const longDescription = 'x'.repeat(260);
    findUnique.mockResolvedValue({
      ...STORED_CATEGORY,
      descriptionEn: 'Old description',
      image: null,
      internalNote: 'old-note',
      passwordHash: 'old-hash',
    });
    doubles().category.update.mockResolvedValue({
      ...STORED_CATEGORY,
      descriptionEn: longDescription,
      image: 'https://cdn.example.com/new.png',
      internalNote: 'new-note',
      passwordHash: 'new-hash',
    });

    const result = await updateCategory('cat-1', {
      ...VALID_INPUT,
      descriptionEn: longDescription,
      image: 'https://cdn.example.com/new.png',
    });

    expect(result).toEqual({ ok: true, slug: 'machine-category' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'CATEGORY_UPDATE',
      entity: 'MachineCategory:machine-category',
    });
    expect(
      data.details.changes.map((change: { field: string }) => change.field)
    ).toEqual(['descriptionEn', 'image']);
    expect(data.details.changes[0]).toMatchObject({
      type: 'longText',
      from: {
        preview: 'Old description',
        length: 15,
        truncated: false,
      },
      to: {
        preview: `${'x'.repeat(200)}…`,
        length: 260,
        truncated: true,
      },
    });
    expect(data.details.changes[1]).toEqual({
      field: 'image',
      labelKey: 'image',
      type: 'imageUrl',
      from: null,
      to: 'https://cdn.example.com/new.png',
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('old-note');
    expect(json).not.toContain('new-note');
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('new-hash');
  });

  it('writes an empty changes list for a no-op save', async () => {
    await updateCategory('cat-1', VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe('CATEGORY_UPDATE');
    expect(data.details).toEqual({
      changes: [],
      ...label('Machine category', 'فئة الآلات'),
    });
  });

  it('returns not_found without writing when the row vanishes inside the transaction', async () => {
    findUnique.mockResolvedValue(null);

    const result = await updateCategory('missing', VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().category.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});

describe('deleteCategory', () => {
  it('records the identifying snapshot in the Before column', async () => {
    findUnique.mockResolvedValue({
      ...STORED_CATEGORY,
      descriptionEn: 'not identifying',
      image: 'https://cdn.example.com/not-identifying.png',
    });

    const result = await deleteCategory('cat-1');

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'CATEGORY_DELETE',
      entity: 'MachineCategory:machine-category',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Machine category',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'فئة الآلات',
          to: null,
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'machine-category',
          to: null,
        },
      ],
      ...label('Machine category', 'فئة الآلات'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('not-identifying');
  });

  it('still refuses a category with machines before opening the transaction', async () => {
    outerFindUnique.mockResolvedValue({
      id: 'cat-1',
      slug: 'machine-category',
      _count: { machines: 2 },
    });

    const result = await deleteCategory('cat-1');

    expect(result).toEqual({
      ok: false,
      error: 'has_machines',
      machineCount: 2,
    });
    expect(doubles().category.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
