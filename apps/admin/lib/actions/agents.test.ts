import { assert, beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import {
  createAgent,
  deleteAgent,
  setAgentPublished,
  updateAgent,
} from './agents';

// Agent-action contract tests. Prisma is a small in-memory double so the
// transaction boundary and the audit payload can be inspected without a
// database; auth, messages and revalidation are mocked so each test sees
// exactly one concern. The revalidation assertions are the Stage 37a
// contract: a mutation must revalidate BOTH locale variants of the public
// /agents page ('/en/agents' + '/ar/agents', expanded by
// `revalidateWebPaths(['/agents'])`).
vi.mock('@colina/db', () => {
  const txAgent = {
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
      callback({ agent: txAgent, auditLog: txAuditLog })
    ),
  };
  (prisma as Record<string, unknown>).txAgent = txAgent;
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
  countryAr: 'مصر',
  countryEn: 'Egypt',
  nameAr: 'وكيل الجيزة',
  nameEn: 'Giza office',
  cityAr: '',
  cityEn: 'Cairo',
  websiteUrl: '',
  logoUrl: '',
};

const STORED_AGENT = {
  id: 'agent-1',
  countryAr: 'مصر',
  countryEn: 'Egypt',
  nameAr: 'وكيل الجيزة',
  nameEn: 'Giza office',
  cityAr: null,
  cityEn: 'Cairo',
  addressAr: null,
  addressEn: null,
  phone: null,
  email: null,
  websiteUrl: null,
  logoUrl: null,
  isPublished: true,
};

/** The label metadata every details payload carries for a named agent. */
const label = (en: string, ar: string) => ({
  label: { en, ar },
  search: `${en} ${ar}`.toLowerCase(),
});

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    agent: mock.txAgent as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

const findUnique = doubles().agent.findUnique;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().agent.create.mockResolvedValue(STORED_AGENT);
  doubles().agent.update.mockResolvedValue(STORED_AGENT);
  doubles().agent.delete.mockResolvedValue(STORED_AGENT);
  doubles().auditLog.create.mockResolvedValue({});
  findUnique.mockResolvedValue(STORED_AGENT);
});

const revalidatedLocales = () =>
  vi.mocked(revalidatePath).mock.calls.filter((call) => call[1] === 'page');

describe('createAgent', () => {
  it('writes the audit entry and revalidates /agents in both locales', async () => {
    const result = await createAgent(VALID_INPUT);

    expect(result).toEqual({ ok: true, id: 'agent-1' });
    expect(doubles().agent.create).toHaveBeenCalledTimes(1);
    expect(doubles().auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'AGENT_CREATE',
          entity: 'Agent:agent-1',
        }),
      })
    );
    // LOCALES in revalidate-web.ts is ['ar', 'en'], so ar expands first.
    expect(revalidatedLocales().map((call) => call[0])).toEqual([
      '/ar/agents',
      '/en/agents',
    ]);
  });

  it('records a snapshot of the identifying fields only', async () => {
    doubles().agent.create.mockResolvedValue({
      ...STORED_AGENT,
      isPublished: false,
      phone: '+20 100 000 0000',
      email: 'agent@example.com',
      id: 'agent-1',
      createdAt: new Date(0),
      passwordHash: 'must-never-leak',
    });

    await createAgent(VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: null,
          to: 'Giza office',
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: null,
          to: 'وكيل الجيزة',
        },
        {
          field: 'countryEn',
          labelKey: 'countryEn',
          type: 'text',
          from: null,
          to: 'Egypt',
        },
        {
          field: 'countryAr',
          labelKey: 'countryAr',
          type: 'text',
          from: null,
          to: 'مصر',
        },
        {
          field: 'cityEn',
          labelKey: 'cityEn',
          type: 'text',
          from: null,
          to: 'Cairo',
        },
        {
          field: 'isPublished',
          labelKey: 'isPublished',
          type: 'boolean',
          from: null,
          to: false,
        },
      ],
      ...label('Giza office', 'وكيل الجيزة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('agent@example.com');
    expect(json).not.toContain('+20 100 000 0000');
    expect(json).not.toContain('must-never-leak');
  });

  it('does nothing for an unauthenticated admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null as never);
    const result = await createAgent(VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(doubles().agent.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('fails validation and revalidates nothing when a country is missing', async () => {
    const result = await createAgent({ ...VALID_INPUT, countryEn: '' });

    expect(result.ok).toBe(false);
    expect(doubles().agent.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('fails validation when the names are missing (legacy rows still exist, but a save must name an agent)', async () => {
    const { nameAr: _ar, nameEn: _en, ...unnamed } = VALID_INPUT;
    void _ar;
    void _en;
    const result = await createAgent(unnamed);

    assert(!result.ok);
    expect(result.issues?.some((issue) => issue.field === 'nameAr')).toBe(true);
    expect(result.issues?.some((issue) => issue.field === 'nameEn')).toBe(true);
    expect(doubles().agent.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('writes the profile fields and defaults to published on create', async () => {
    const result = await createAgent({
      ...VALID_INPUT,
      websiteUrl: 'https://agent.example.com',
      logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
      isPublished: undefined,
    });

    expect(result).toEqual({ ok: true, id: 'agent-1' });
    // The schema passed the URL through; the switch defaults to published.
    expect(doubles().agent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nameAr: 'وكيل الجيزة',
          nameEn: 'Giza office',
          websiteUrl: 'https://agent.example.com',
          logoUrl: 'https://res.cloudinary.com/demo/image/upload/logo.png',
          isPublished: true,
        }),
      })
    );
  });

  it('rejects an invalid website URL before anything is written', async () => {
    for (const bad of [
      'not a url',
      'https://user:secret@example.com',
      'javascript:alert(1)',
    ]) {
      const result = await createAgent({
        ...VALID_INPUT,
        websiteUrl: bad,
      });
      expect(result).toMatchObject({ ok: false, error: 'validation_failed' });
    }
    expect(doubles().agent.create).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('clears an empty website to null and keeps the stored switch on update', async () => {
    await updateAgent('agent-1', { ...VALID_INPUT, isPublished: undefined });

    expect(doubles().agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-1' },
        data: expect.objectContaining({
          websiteUrl: null,
          logoUrl: null,
          isPublished: undefined,
        }),
      })
    );
  });
});

describe('updateAgent', () => {
  it('writes the audit entry and revalidates /agents in both locales', async () => {
    const result = await updateAgent('agent-1', VALID_INPUT);

    expect(result).toEqual({ ok: true });
    expect(doubles().agent.update).toHaveBeenCalledTimes(1);
    expect(doubles().auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'AGENT_UPDATE',
          entity: 'Agent:agent-1',
        }),
      })
    );
    expect(revalidatedLocales().map((call) => call[0])).toEqual([
      '/ar/agents',
      '/en/agents',
    ]);
  });

  it('revalidates nothing when the agent does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const result = await updateAgent('missing', VALID_INPUT);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().agent.update).not.toHaveBeenCalled();
    expect(revalidatedLocales()).toEqual([]);
  });

  it('stores only the changed allowlisted fields, never secrets', async () => {
    findUnique.mockResolvedValue({
      ...STORED_AGENT,
      passwordHash: 'old-hash',
      updatedAt: new Date(0),
    });
    doubles().agent.update.mockResolvedValue({
      ...STORED_AGENT,
      nameEn: 'Giza office 2',
      isPublished: false,
      passwordHash: 'new-hash',
      updatedAt: new Date(1),
    });

    await updateAgent('agent-1', VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Giza office',
          to: 'Giza office 2',
        },
        {
          field: 'isPublished',
          labelKey: 'isPublished',
          type: 'boolean',
          from: true,
          to: false,
        },
      ],
      ...label('Giza office 2', 'وكيل الجيزة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('old-hash');
    expect(json).not.toContain('new-hash');
    expect(json).not.toContain('updatedAt');
  });

  it('still writes an empty changes list when nothing changed', async () => {
    await updateAgent('agent-1', VALID_INPUT);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.action).toBe('AGENT_UPDATE');
    expect(data.details).toEqual({
      changes: [],
      ...label('Giza office', 'وكيل الجيزة'),
    });
  });
});

describe('setAgentPublished', () => {
  it('flips the switch, audits the resulting state and revalidates /agents when hiding', async () => {
    const result = await setAgentPublished('agent-1', false);

    expect(result).toEqual({ ok: true });
    expect(doubles().agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'agent-1' },
        data: { isPublished: false },
      })
    );
    expect(doubles().auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'AGENT_HIDE',
          entity: 'Agent:agent-1',
        }),
      })
    );
    expect(revalidatedLocales().map((call) => call[0])).toEqual([
      '/ar/agents',
      '/en/agents',
    ]);
  });

  it('audits AGENT_PUBLISH and revalidates /agents when publishing', async () => {
    const result = await setAgentPublished('agent-1', true);

    expect(result).toEqual({ ok: true });
    expect(doubles().agent.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isPublished: true },
      })
    );
    expect(doubles().auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'AGENT_PUBLISH' }),
      })
    );
    expect(revalidatedLocales().map((call) => call[0])).toEqual([
      '/ar/agents',
      '/en/agents',
    ]);
  });

  it('records the visibility change in the details payload', async () => {
    await setAgentPublished('agent-1', false);

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [
        {
          field: 'isPublished',
          labelKey: 'isPublished',
          type: 'boolean',
          from: true,
          to: false,
        },
      ],
      ...label('Giza office', 'وكيل الجيزة'),
    });
  });

  it('does nothing for an unauthenticated admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null as never);
    const result = await setAgentPublished('agent-1', false);

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(doubles().agent.update).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('revalidates nothing when the agent does not exist', async () => {
    findUnique.mockResolvedValue(null);
    const result = await setAgentPublished('missing', true);

    expect(result).toEqual({ ok: false, error: 'not_found' });
    expect(doubles().agent.update).not.toHaveBeenCalled();
    expect(revalidatedLocales()).toEqual([]);
  });
});

describe('deleteAgent', () => {
  it('writes the audit entry and revalidates /agents in both locales', async () => {
    const result = await deleteAgent('agent-1');

    expect(result).toEqual({ ok: true });
    expect(doubles().agent.delete).toHaveBeenCalledTimes(1);
    expect(doubles().auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          adminUserId: 'admin-1',
          action: 'AGENT_DELETE',
          entity: 'Agent:agent-1',
        }),
      })
    );
    expect(revalidatedLocales().map((call) => call[0])).toEqual([
      '/ar/agents',
      '/en/agents',
    ]);
  });

  it('records a delete snapshot and leaves contacts out of it', async () => {
    findUnique.mockResolvedValue({
      ...STORED_AGENT,
      email: 'agent@example.com',
      phone: '+20 100 000 0000',
      addressEn: '12 Industrial Zone',
      createdAt: new Date(0),
    });

    await deleteAgent('agent-1');

    const data = doubles().auditLog.create.mock.calls[0][0].data;
    expect(data.details).toEqual({
      changes: [
        {
          field: 'nameEn',
          labelKey: 'nameEn',
          type: 'text',
          from: 'Giza office',
          to: null,
        },
        {
          field: 'nameAr',
          labelKey: 'nameAr',
          type: 'text',
          from: 'وكيل الجيزة',
          to: null,
        },
        {
          field: 'countryEn',
          labelKey: 'countryEn',
          type: 'text',
          from: 'Egypt',
          to: null,
        },
        {
          field: 'countryAr',
          labelKey: 'countryAr',
          type: 'text',
          from: 'مصر',
          to: null,
        },
        {
          field: 'cityEn',
          labelKey: 'cityEn',
          type: 'text',
          from: 'Cairo',
          to: null,
        },
        {
          field: 'isPublished',
          labelKey: 'isPublished',
          type: 'boolean',
          from: true,
          to: null,
        },
      ],
      ...label('Giza office', 'وكيل الجيزة'),
    });
    const json = JSON.stringify(data.details);
    expect(json).not.toContain('agent@example.com');
    expect(json).not.toContain('+20 100 000 0000');
    expect(json).not.toContain('12 Industrial Zone');
  });

  it('does nothing for an unauthenticated admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null as never);
    const result = await deleteAgent('agent-1');

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(doubles().agent.delete).not.toHaveBeenCalled();
    expect(revalidatedLocales()).toEqual([]);
  });
});
