import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createPartner, deletePartner, updatePartner } from './partners';

vi.mock('@colina/db', () => {
  const txPartner = {
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
      callback({ partner: txPartner, auditLog: txAuditLog })
    ),
  };
  (prisma as Record<string, unknown>).txPartner = txPartner;
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
  nameAr: 'شريك تجاري',
  nameEn: 'Trade partner',
  logo: 'https://cdn.example.com/logo.png',
};

const STORED_PARTNER = {
  id: 'partner-1',
  nameAr: 'شريك تجاري',
  nameEn: 'Trade partner',
  logo: 'https://cdn.example.com/logo.png',
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    partner: mock.txPartner as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

const findUnique = doubles().partner.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().partner.create.mockResolvedValue(STORED_PARTNER);
  doubles().partner.update.mockResolvedValue(STORED_PARTNER);
  doubles().partner.delete.mockResolvedValue(STORED_PARTNER);
  doubles().auditLog.create.mockResolvedValue({});
  findUnique.mockResolvedValue(STORED_PARTNER);
});

describe('createPartner', () => {
  it('records an identifying snapshot, not the logo or non-allowlisted fields', async () => {
    doubles().partner.create.mockResolvedValue({
      ...STORED_PARTNER,
      createdAt: new Date(0),
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createPartner(VALID_INPUT);

    expect(result).toEqual({ ok: true, id: 'partner-1' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      adminUserId: 'admin-1',
      action: 'PARTNER_CREATE',
      entity: 'Partner:partner-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Trade partner',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'شريك تجاري',
        },
      ],
      ...label('Trade partner', 'شريك تجاري'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('logo.png');
    expect(json).not.toContain('must-not-leak');
  });
});

describe('updatePartner', () => {
  it('records exactly the changed allowlisted fields', async () => {
    findUnique.mockResolvedValue({
      nameAr: 'شريك تجاري',
      nameEn: 'Old partner name',
      logo: null,
      updatedAt: new Date(0),
      internalNote: 'old-note',
      passwordHash: 'old-hash',
    });
    doubles().partner.update.mockResolvedValue({
      nameAr: 'شريك تجاري',
      nameEn: 'New partner name',
      logo: 'https://cdn.example.com/new-logo.png',
      updatedAt: new Date(1),
      internalNote: 'new-note',
      passwordHash: 'new-hash',
    });

    const result = await updatePartner('partner-1', {
      ...VALID_INPUT,
      nameEn: 'New partner name',
      logo: 'https://cdn.example.com/new-logo.png',
    });

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'PARTNER_UPDATE',
      entity: 'Partner:partner-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Old partner name',
          to: 'New partner name',
        },
        {
          field: 'logo',
          labelKey: 'logo',
          type: 'imageUrl',
          from: null,
          to: 'https://cdn.example.com/new-logo.png',
        },
      ],
      ...label('New partner name', 'شريك تجاري'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('old-note');
    expect(json).not.toContain('new-note');
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('new-hash');
  });

  it('still writes the entry with an empty changes list when nothing changed', async () => {
    await updatePartner('partner-1', VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe('PARTNER_UPDATE');
    expect(data.entity).toBe('Partner:partner-1');
    expect(data.details).toEqual({
      changes: [],
      ...label('Trade partner', 'شريك تجاري'),
    });
  });

  it('returns not_found inside the transaction without writing anything', async () => {
    findUnique.mockResolvedValue(null);

    const result = await updatePartner('missing', VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().partner.update).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });

  it('turns an audit failure into a generic server_error', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    doubles().auditLog.create.mockRejectedValue(
      new Error('raw database detail that must not reach the client')
    );

    const result = await updatePartner('partner-1', VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(result)).not.toContain('raw database detail');
    consoleError.mockRestore();
  });
});

describe('deletePartner', () => {
  it('records the identifying snapshot in the Before column', async () => {
    findUnique.mockResolvedValue({
      ...STORED_PARTNER,
      createdAt: new Date(0),
      passwordHash: 'must-not-leak',
    });

    const result = await deletePartner('partner-1');

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'PARTNER_DELETE',
      entity: 'Partner:partner-1',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Trade partner',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'شريك تجاري',
          to: null,
        },
      ],
      ...label('Trade partner', 'شريك تجاري'),
    });
    expect(JSON.stringify(data.details)).not.toContain('must-not-leak');
  });

  it('returns not_found without deleting when the row is gone', async () => {
    findUnique.mockResolvedValue(null);

    const result = await deletePartner('missing');

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().partner.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
