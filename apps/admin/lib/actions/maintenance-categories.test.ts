import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import {
  createMaintenanceCategory,
  deleteMaintenanceCategory,
  updateMaintenanceCategory,
} from './maintenance-categories';

vi.mock('@colina/db', () => {
  const txMaintenanceCategory = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = { create: vi.fn() };
  const prisma = {
    // Delete pre-checks the item count outside the transaction.
    maintenanceCategory: { findUnique: vi.fn() },
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        maintenanceCategory: txMaintenanceCategory,
        auditLog: txAuditLog,
      })
    ),
  };
  (prisma as Record<string, unknown>).txMaintenanceCategory =
    txMaintenanceCategory;
  (prisma as Record<string, unknown>).txAuditLog = txAuditLog;
  return { prisma };
});

vi.mock('../admin-action', () => ({ requireAdmin: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `msg-${key}`),
}));

const SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
};

const INPUT = {
  nameAr: 'خط التعبئة',
  nameEn: 'Bottling line',
  slug: 'bottling-line',
  descriptionAr: '',
  descriptionEn: 'English description',
  imageUrl: '',
  sortOrder: 3,
};

const STORED = {
  id: 'category-1',
  nameEn: 'Bottling line',
  nameAr: 'خط التعبئة',
  slug: 'bottling-line',
  descriptionEn: 'English description',
  descriptionAr: null,
  imageUrl: null,
  sortOrder: 3,
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    category: mock.txMaintenanceCategory as Record<
      string,
      ReturnType<typeof vi.fn>
    >,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
    precheck: (
      prisma as unknown as {
        maintenanceCategory: { findUnique: ReturnType<typeof vi.fn> };
      }
    ).maintenanceCategory,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().category.create.mockResolvedValue(STORED);
  doubles().category.update.mockResolvedValue(STORED);
  doubles().category.delete.mockResolvedValue(STORED);
  doubles().category.findUnique.mockResolvedValue(STORED);
  doubles().precheck.findUnique.mockResolvedValue({
    ...STORED,
    _count: { items: 0 },
  });
  doubles().auditLog.create.mockResolvedValue({});
});

describe('createMaintenanceCategory', () => {
  it('records the identifying snapshot and ignores extra row fields', async () => {
    doubles().category.create.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createMaintenanceCategory(INPUT);

    expect(result).toEqual({ ok: true, slug: 'bottling-line' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'MAINTENANCE_CATEGORY_CREATE',
      entity: 'MaintenanceCategory:bottling-line',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Bottling line',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'خط التعبئة',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: null,
          to: 'bottling-line',
        },
      ],
      ...label('Bottling line', 'خط التعبئة'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });
});

describe('updateMaintenanceCategory', () => {
  it('loads the before-row inside the transaction with the allowlisted select', async () => {
    await updateMaintenanceCategory('category-1', INPUT);

    expect(doubles().category.findUnique).toHaveBeenCalledWith({
      where: { id: 'category-1' },
      select: {
        nameEn: true,
        nameAr: true,
        slug: true,
        descriptionEn: true,
        descriptionAr: true,
        imageUrl: true,
        sortOrder: true,
      },
    });
  });

  it('records exactly the changed fields', async () => {
    doubles().category.findUnique.mockResolvedValue({
      ...STORED,
      nameEn: 'Old line',
      slug: 'old-line',
      descriptionEn: 'Old description',
      imageUrl: 'https://cdn.example.com/old.png',
      sortOrder: 1,
    });
    doubles().category.update.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await updateMaintenanceCategory('category-1', INPUT);

    expect(result).toEqual({ ok: true, slug: 'bottling-line' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MAINTENANCE_CATEGORY_UPDATE',
      entity: 'MaintenanceCategory:bottling-line',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Old line',
          to: 'Bottling line',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'old-line',
          to: 'bottling-line',
        },
        {
          field: 'descriptionEn',
          labelKey: 'descriptionEn',
          type: 'longText',
          from: { preview: 'Old description', length: 15, truncated: false },
          to: { preview: 'English description', length: 19, truncated: false },
        },
        {
          field: 'imageUrl',
          labelKey: 'image',
          type: 'imageUrl',
          from: 'https://cdn.example.com/old.png',
          to: null,
        },
        {
          field: 'sortOrder',
          labelKey: 'sortOrder',
          type: 'number',
          from: 1,
          to: 3,
        },
      ],
      ...label('Bottling line', 'خط التعبئة'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('still writes an entry with an empty changes list on a no-op save', async () => {
    await updateMaintenanceCategory('category-1', INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [],
      ...label('Bottling line', 'خط التعبئة'),
    });
  });

  it('returns not_found without writing when the row is gone', async () => {
    doubles().category.findUnique.mockResolvedValue(null);

    await expect(updateMaintenanceCategory('missing', INPUT)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().category.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('maps a database failure to a generic server_error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await updateMaintenanceCategory('category-1', INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    consoleError.mockRestore();
  });
});

describe('deleteMaintenanceCategory', () => {
  it('records the identifying snapshot in the Before column', async () => {
    doubles().category.findUnique.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    await expect(deleteMaintenanceCategory('category-1')).resolves.toEqual({
      ok: true,
    });

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MAINTENANCE_CATEGORY_DELETE',
      entity: 'MaintenanceCategory:bottling-line',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Bottling line',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'خط التعبئة',
          to: null,
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'bottling-line',
          to: null,
        },
      ],
      ...label('Bottling line', 'خط التعبئة'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('refuses to delete a category that still has showcase items', async () => {
    doubles().precheck.findUnique.mockResolvedValue({
      ...STORED,
      _count: { items: 2 },
    });

    await expect(deleteMaintenanceCategory('category-1')).resolves.toEqual({
      ok: false,
      error: 'has_items',
      itemCount: 2,
    });
    expect(doubles().category.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('returns not_found without deleting when the row is gone', async () => {
    doubles().precheck.findUnique.mockResolvedValue(null);

    await expect(deleteMaintenanceCategory('missing')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().category.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
