import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createMachine, deleteMachine, updateMachine } from './machines';

vi.mock('@colina/db', () => {
  const txMachine = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txMachineImage = {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  };
  const txAuditLog = {
    create: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        machine: txMachine,
        machineImage: txMachineImage,
        auditLog: txAuditLog,
      })
    ),
  };
  (prisma as Record<string, unknown>).txMachine = txMachine;
  (prisma as Record<string, unknown>).txMachineImage = txMachineImage;
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
  nameAr: 'آلة التعبئة',
  nameEn: 'Filling machine',
  slug: 'filling-machine',
  categoryId: 'cat-1',
  shortDescriptionAr: 'وصف قصير للآلة',
  shortDescriptionEn: 'A short description',
  descriptionAr: '',
  descriptionEn: 'New description',
  specsAr: '',
  specsEn: '',
  datasheetUrl: 'https://example.com/datasheet.pdf',
  images: [
    { url: 'https://cdn.example.com/second.png', position: 1 },
    { url: 'https://cdn.example.com/first.png', position: 0 },
  ],
  relatedIds: ['r1', 'r2'],
};

const STORED_MACHINE = {
  id: 'machine-1',
  nameAr: 'آلة التعبئة',
  nameEn: 'Filling machine',
  slug: 'filling-machine',
  categoryId: 'cat-1',
  shortDescriptionAr: 'وصف قصير للآلة',
  shortDescriptionEn: 'A short description',
  descriptionAr: '',
  descriptionEn: 'New description',
  specsAr: '',
  specsEn: '',
  datasheetUrl: 'https://example.com/datasheet.pdf',
};

const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    machine: mock.txMachine as Record<string, ReturnType<typeof vi.fn>>,
    image: mock.txMachineImage as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

const findUnique = doubles().machine.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().machine.create.mockResolvedValue({
    ...STORED_MACHINE,
    category: { slug: 'machine-category' },
  });
  doubles().machine.update.mockResolvedValue({
    ...STORED_MACHINE,
    category: { slug: 'machine-category' },
  });
  doubles().machine.delete.mockResolvedValue(STORED_MACHINE);
  doubles().image.deleteMany.mockResolvedValue({ count: 0 });
  doubles().image.createMany.mockResolvedValue({ count: 0 });
  doubles().auditLog.create.mockResolvedValue({});
  findUnique.mockResolvedValue({
    ...STORED_MACHINE,
    descriptionEn: 'New description',
    category: { slug: 'machine-category' },
    images: [{ url: 'https://cdn.example.com/second.png' }],
    relatedMachines: [{ id: 'r1' }, { id: 'r2' }],
  });
});

describe('createMachine', () => {
  it('records an identifying snapshot, not the form payload', async () => {
    doubles().machine.create.mockResolvedValue({
      ...STORED_MACHINE,
      category: { slug: 'machine-category' },
      createdAt: new Date(0),
      internalNote: 'must-not-leak',
      passwordHash: 'must-not-leak',
    });

    const result = await createMachine(VALID_INPUT);

    expect(result).toEqual({
      ok: true,
      slug: 'filling-machine',
      categorySlug: 'machine-category',
    });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MACHINE_CREATE',
      entity: 'Machine:filling-machine',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Filling machine',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'آلة التعبئة',
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: null,
          to: 'filling-machine',
        },
      ],
      ...label('Filling machine', 'آلة التعبئة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('must-not-leak');
    expect(json).not.toContain('datasheet');
  });
});

describe('updateMachine', () => {
  it('records the persisted changes: category, description, image and related counts', async () => {
    const update = doubles().machine.update;
    findUnique.mockResolvedValue({
      ...STORED_MACHINE,
      descriptionEn: 'Old description',
      category: { slug: 'old-category' },
      images: [{ url: 'https://cdn.example.com/old.png' }],
      relatedMachines: [{ id: 'r1' }],
      internalNote: 'old-note',
      passwordHash: 'old-hash',
    });
    update.mockResolvedValue({
      ...STORED_MACHINE,
      category: { slug: 'new-category' },
      internalNote: 'new-note',
      passwordHash: 'new-hash',
    });

    const result = await updateMachine('machine-1', VALID_INPUT);

    expect(result).toEqual({ ok: true, slug: 'filling-machine' });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MACHINE_UPDATE',
      entity: 'Machine:filling-machine',
    });
    expect(data.details.changes).toEqual([
      {
        field: 'categorySlug',
        labelKey: 'category',
        type: 'text',
        from: 'old-category',
        to: 'new-category',
      },
      {
        field: 'descriptionEn',
        labelKey: 'descriptionEn',
        type: 'longText',
        from: {
          preview: 'Old description',
          length: 15,
          truncated: false,
        },
        to: {
          preview: 'New description',
          length: 15,
          truncated: false,
        },
      },
      {
        field: 'images',
        labelKey: 'images',
        type: 'list',
        from: 1,
        to: 2,
      },
      {
        field: 'relatedIds',
        labelKey: 'relatedIds',
        type: 'list',
        from: 1,
        to: 2,
      },
    ]);
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('old-note');
    expect(json).not.toContain('new-note');
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('new-hash');
  });

  it('writes an empty changes list for a no-op save', async () => {
    findUnique.mockResolvedValue({
      ...STORED_MACHINE,
      category: { slug: 'machine-category' },
      images: [
        { url: 'https://cdn.example.com/first.png' },
        { url: 'https://cdn.example.com/second.png' },
      ],
      relatedMachines: [{ id: 'r1' }, { id: 'r2' }],
    });

    await updateMachine('machine-1', VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe('MACHINE_UPDATE');
    expect(data.details).toEqual({
      changes: [],
      ...label('Filling machine', 'آلة التعبئة'),
    });
  });

  it('returns not_found without writing when the row vanishes inside the transaction', async () => {
    findUnique.mockResolvedValue(null);

    const result = await updateMachine('missing', VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().machine.update).not.toHaveBeenCalled();
    expect(doubles().image.deleteMany).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});

describe('deleteMachine', () => {
  it('records the identifying snapshot in the Before column', async () => {
    findUnique.mockResolvedValue({
      ...STORED_MACHINE,
      descriptionEn: 'not identifying',
      category: { slug: 'machine-category' },
      passwordHash: 'must-not-leak',
    });

    const result = await deleteMachine('machine-1');

    expect(result).toEqual({ ok: true });
    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      action: 'MACHINE_DELETE',
      entity: 'Machine:filling-machine',
    });
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Filling machine',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'آلة التعبئة',
          to: null,
        },
        {
          field: 'slug',
          labelKey: 'slug',
          type: 'text',
          from: 'filling-machine',
          to: null,
        },
      ],
      ...label('Filling machine', 'آلة التعبئة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('not identifying');
    expect(json).not.toContain('must-not-leak');
  });

  it('returns not_found without deleting when the row is gone', async () => {
    findUnique.mockResolvedValue(null);

    const result = await deleteMachine('missing');

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().machine.delete).not.toHaveBeenCalled();
    expect(doubles().auditLog.create).not.toHaveBeenCalled();
  });
});
