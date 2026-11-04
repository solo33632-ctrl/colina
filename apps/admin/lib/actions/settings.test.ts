import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { saveSiteSettings } from './settings';

vi.mock('@colina/db', () => {
  const txSiteSettings = {
    findUnique: vi.fn(),
    upsert: vi.fn(),
  };
  const txAuditLog = { create: vi.fn() };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ siteSettings: txSiteSettings, auditLog: txAuditLog })
    ),
  };
  (prisma as Record<string, unknown>).txSiteSettings = txSiteSettings;
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
  whatsappNumber: '+20 100 123 4567',
  whatsappMessageEn: 'Hello from the factory',
  whatsappMessageAr: 'مرحبا من المصنع',
  contactPhone: '+20 100 765 4321',
  contactEmail: 'Info@Example.com',
  factoryAddressEn: 'Factory address',
  factoryAddressAr: 'عنوان المصنع',
  workingHoursEn: '9-5',
  workingHoursAr: '٩-٥',
  mapsUrl: 'https://maps.example.com/new',
};

// What the schema transform stores: WhatsApp digits only, email lower-cased,
// phone kept as a display value.
const STORED = {
  whatsappNumber: '201001234567',
  whatsappMessageEn: 'Hello from the factory',
  whatsappMessageAr: 'مرحبا من المصنع',
  contactPhone: '+20 100 765 4321',
  contactEmail: 'info@example.com',
  factoryAddressEn: 'Factory address',
  factoryAddressAr: 'عنوان المصنع',
  workingHoursEn: '9-5',
  workingHoursAr: '٩-٥',
  mapsUrl: 'https://maps.example.com/new',
};

const BEFORE = {
  ...STORED,
  whatsappNumber: '201009999999',
  contactEmail: 'old@example.com',
};

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    settings: mock.txSiteSettings as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().settings.findUnique.mockResolvedValue(BEFORE);
  doubles().settings.upsert.mockResolvedValue(STORED);
  doubles().auditLog.create.mockResolvedValue({});
});

describe('saveSiteSettings audit payload', () => {
  it('loads the previous business fields inside the transaction', async () => {
    await saveSiteSettings(INPUT);

    expect(doubles().settings.findUnique).toHaveBeenCalledWith({
      where: { id: 'main' },
      select: {
        whatsappNumber: true,
        whatsappMessageEn: true,
        whatsappMessageAr: true,
        contactPhone: true,
        contactEmail: true,
        factoryAddressEn: true,
        factoryAddressAr: true,
        workingHoursEn: true,
        workingHoursAr: true,
        mapsUrl: true,
      },
    });
  });

  it('records exactly the changed business fields', async () => {
    const result = await saveSiteSettings(INPUT);

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'SETTINGS_UPDATE',
      entity: 'SiteSettings:main',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'whatsappNumber',
          labelKey: 'whatsappNumber',
          type: 'text',
          from: '201009999999',
          to: '201001234567',
        },
        {
          field: 'contactEmail',
          labelKey: 'contactEmail',
          type: 'text',
          from: 'old@example.com',
          to: 'info@example.com',
        },
      ],
    });
  });

  it('still writes an entry with an empty changes list on a no-op save', async () => {
    doubles().settings.findUnique.mockResolvedValue(STORED);

    await saveSiteSettings(INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({ changes: [] });
  });

  it('records a first save as field snapshots and never leaks extra columns', async () => {
    doubles().settings.findUnique.mockResolvedValue(null);
    doubles().settings.upsert.mockResolvedValue({
      ...STORED,
      apiKey: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    await saveSiteSettings(INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    const fields = data.details.changes.map(
      (change: { field: string }) => change.field
    );
    expect(fields).toEqual([
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
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('rejects a non-super-admin before reading or writing anything', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: 'admin-2', email: 'editor@example.com', role: 'EDITOR' },
    } as never);

    await expect(saveSiteSettings(INPUT)).resolves.toEqual({
      ok: false,
      error: 'forbidden',
    });
    expect(doubles().settings.findUnique).not.toHaveBeenCalled();
    expect(doubles().settings.upsert).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('maps a database failure to a generic server_error without echoing input', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await saveSiteSettings(INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    expect(JSON.stringify(result)).not.toContain('Info@Example.com');
    consoleError.mockRestore();
  });
});
