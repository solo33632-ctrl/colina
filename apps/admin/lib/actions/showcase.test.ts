import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createShowcase, deleteShowcase, updateShowcase } from './showcase';

vi.mock('@colina/db', () => {
  const txMaintenanceShowcase = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = { create: vi.fn() };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        maintenanceShowcase: txMaintenanceShowcase,
        auditLog: txAuditLog,
      })
    ),
  };
  (prisma as Record<string, unknown>).txMaintenanceShowcase =
    txMaintenanceShowcase;
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
  nameAr: 'عمل التعبئة',
  nameEn: 'Filling job',
  categoryId: 'cat-2',
  descriptionEn: 'New description',
  descriptionAr: 'الوصف الجديد',
  beforeImageUrl: 'https://cdn.example.com/before-b.png',
  afterImageUrl: 'https://cdn.example.com/after-b.png',
};

const STORED = {
  id: 'showcase-1',
  nameEn: 'Filling job',
  nameAr: 'عمل التعبئة',
  categoryId: 'cat-2',
  category: { nameEn: 'Packaging line' },
  descriptionEn: 'New description',
  descriptionAr: 'الوصف الجديد',
  beforeImageUrl: 'https://cdn.example.com/before-b.png',
  afterImageUrl: 'https://cdn.example.com/after-b.png',
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    showcase: mock.txMaintenanceShowcase as Record<
      string,
      ReturnType<typeof vi.fn>
    >,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().showcase.create.mockResolvedValue(STORED);
  doubles().showcase.update.mockResolvedValue(STORED);
  doubles().showcase.delete.mockResolvedValue(STORED);
  doubles().showcase.findUnique.mockResolvedValue(STORED);
  doubles().auditLog.create.mockResolvedValue({});
});

describe('createShowcase', () => {
  it('records the identifying snapshot only', async () => {
    doubles().showcase.create.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createShowcase(INPUT);

    expect(result).toEqual({ ok: true, id: 'showcase-1' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'MAINTENANCE_SHOWCASE_CREATE',
      entity: 'MaintenanceShowcase:showcase-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Filling job',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'عمل التعبئة',
        },
      ],
      ...label('Filling job', 'عمل التعبئة'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });
});

describe('updateShowcase', () => {
  it('loads the before-row and its category inside the transaction', async () => {
    await updateShowcase('showcase-1', INPUT);

    expect(doubles().showcase.findUnique).toHaveBeenCalledWith({
      where: { id: 'showcase-1' },
      select: {
        nameEn: true,
        nameAr: true,
        categoryId: true,
        category: { select: { nameEn: true } },
        descriptionEn: true,
        descriptionAr: true,
        beforeImageUrl: true,
        afterImageUrl: true,
      },
    });
  });

  it('shows the category by name and records the changed photos', async () => {
    doubles().showcase.findUnique.mockResolvedValue({
      ...STORED,
      categoryId: 'cat-1',
      category: { nameEn: 'Bottling line' },
      descriptionEn: 'Old description',
      beforeImageUrl: 'https://cdn.example.com/before-a.png',
      afterImageUrl: 'https://cdn.example.com/after-a.png',
    });
    doubles().showcase.update.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await updateShowcase('showcase-1', INPUT);

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MAINTENANCE_SHOWCASE_UPDATE',
      entity: 'MaintenanceShowcase:showcase-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'category',
          labelKey: 'category',
          type: 'text',
          from: 'Bottling line',
          to: 'Packaging line',
        },
        {
          field: 'descriptionEn',
          labelKey: 'descriptionEn',
          type: 'longText',
          from: { preview: 'Old description', length: 15, truncated: false },
          to: { preview: 'New description', length: 15, truncated: false },
        },
        {
          field: 'beforeImageUrl',
          labelKey: 'beforeImage',
          type: 'imageUrl',
          from: 'https://cdn.example.com/before-a.png',
          to: 'https://cdn.example.com/before-b.png',
        },
        {
          field: 'afterImageUrl',
          labelKey: 'afterImage',
          type: 'imageUrl',
          from: 'https://cdn.example.com/after-a.png',
          to: 'https://cdn.example.com/after-b.png',
        },
      ],
      ...label('Filling job', 'عمل التعبئة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('must-not-leak');
    expect(json).not.toContain('cat-1');
    expect(json).not.toContain('cat-2');
  });

  it('still writes an entry with an empty changes list on a no-op save', async () => {
    await updateShowcase('showcase-1', INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [],
      ...label('Filling job', 'عمل التعبئة'),
    });
  });

  it('returns not_found without writing when the row is gone', async () => {
    doubles().showcase.findUnique.mockResolvedValue(null);

    await expect(updateShowcase('missing', INPUT)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().showcase.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('maps a database failure to a generic server_error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await updateShowcase('showcase-1', INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    consoleError.mockRestore();
  });
});

describe('deleteShowcase', () => {
  it('records the identifying snapshot in the Before column', async () => {
    doubles().showcase.findUnique.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    await expect(deleteShowcase('showcase-1')).resolves.toEqual({ ok: true });

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MAINTENANCE_SHOWCASE_DELETE',
      entity: 'MaintenanceShowcase:showcase-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Filling job',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'عمل التعبئة',
          to: null,
        },
      ],
      ...label('Filling job', 'عمل التعبئة'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('returns not_found without deleting when the row is gone', async () => {
    doubles().showcase.findUnique.mockResolvedValue(null);

    await expect(deleteShowcase('missing')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().showcase.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
