import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createService, deleteService, updateService } from './services';

vi.mock('@colina/db', () => {
  const txMaintenanceService = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = { create: vi.fn() };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        maintenanceService: txMaintenanceService,
        auditLog: txAuditLog,
      })
    ),
  };
  (prisma as Record<string, unknown>).txMaintenanceService =
    txMaintenanceService;
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
  slug: 'installation',
  titleEn: 'Installation',
  titleAr: 'التركيب',
  descriptionEn: 'Installation description.',
  descriptionAr: 'وصف التركيب الكامل.',
  scopeEn: 'Supply and install the line.',
  scopeAr: 'توريد وتركيب الخط.',
  icon: 'wrench',
};

const STORED = {
  id: 'service-1',
  ...INPUT,
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    service: mock.txMaintenanceService as Record<
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
  doubles().service.create.mockResolvedValue(STORED);
  doubles().service.update.mockResolvedValue(STORED);
  doubles().service.delete.mockResolvedValue(STORED);
  doubles().service.findUnique.mockResolvedValue(STORED);
  doubles().auditLog.create.mockResolvedValue({});
});

describe('createService', () => {
  it('records the identifying snapshot only', async () => {
    doubles().service.create.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createService(INPUT);

    expect(result).toEqual({ ok: true, slug: 'installation' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'SERVICE_CREATE',
      entity: 'MaintenanceService:installation',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'titleEn',
          labelKey: 'titleEn',
          type: 'text',
          from: null,
          to: 'Installation',
        },
        {
          field: 'titleAr',
          labelKey: 'titleAr',
          type: 'text',
          from: null,
          to: 'التركيب',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: null,
          to: 'installation',
        },
      ],
      ...label('Installation', 'التركيب'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });
});

describe('updateService', () => {
  it('loads the before-row inside the transaction with the allowlisted select', async () => {
    await updateService('service-1', INPUT);

    expect(doubles().service.findUnique).toHaveBeenCalledWith({
      where: { id: 'service-1' },
      select: {
        titleEn: true,
        titleAr: true,
        slug: true,
        descriptionEn: true,
        descriptionAr: true,
        scopeEn: true,
        scopeAr: true,
        icon: true,
      },
    });
  });

  it('records exactly the changed fields, including scope and icon', async () => {
    doubles().service.findUnique.mockResolvedValue({
      ...STORED,
      scopeEn: 'Old scope text.',
      icon: 'gear',
    });
    doubles().service.update.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await updateService('service-1', INPUT);

    expect(result).toEqual({ ok: true, slug: 'installation' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'SERVICE_UPDATE',
      entity: 'MaintenanceService:installation',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'scopeEn',
          labelKey: 'scopeEn',
          type: 'longText',
          from: { preview: 'Old scope text.', length: 15, truncated: false },
          to: {
            preview: 'Supply and install the line.',
            length: 28,
            truncated: false,
          },
        },
        {
          field: 'icon',
          labelKey: 'icon',
          type: 'text',
          from: 'gear',
          to: 'wrench',
        },
      ],
      ...label('Installation', 'التركيب'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('still writes an entry with an empty changes list on a no-op save', async () => {
    await updateService('service-1', INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [],
      ...label('Installation', 'التركيب'),
    });
  });

  it('returns not_found without writing when the row is gone', async () => {
    doubles().service.findUnique.mockResolvedValue(null);

    await expect(updateService('missing', INPUT)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().service.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('maps a database failure to a generic server_error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await updateService('service-1', INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    consoleError.mockRestore();
  });
});

describe('deleteService', () => {
  it('records the identifying snapshot in the Before column', async () => {
    doubles().service.findUnique.mockResolvedValue({
      ...STORED,
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    await expect(deleteService('service-1')).resolves.toEqual({ ok: true });

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'SERVICE_DELETE',
      entity: 'MaintenanceService:installation',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'titleEn',
          labelKey: 'titleEn',
          type: 'text',
          from: 'Installation',
          to: null,
        },
        {
          field: 'titleAr',
          labelKey: 'titleAr',
          type: 'text',
          from: 'التركيب',
          to: null,
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'installation',
          to: null,
        },
      ],
      ...label('Installation', 'التركيب'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('returns not_found without deleting when the row is gone', async () => {
    doubles().service.findUnique.mockResolvedValue(null);

    await expect(deleteService('missing')).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().service.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
