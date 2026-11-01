import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { createAgent, deleteAgent, updateAgent } from './agents';

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
  };
  const txAuditLog = {
    create: vi.fn(),
  };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({ agent: txAgent, auditLog: txAuditLog })
    ),
    agent: {
      findUnique: vi.fn(),
    },
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
  cityAr: '',
  cityEn: 'Cairo',
};

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    agent: mock.txAgent as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
  };
};

const findUnique = prisma.agent.findUnique as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
  vi.mocked(getTranslations).mockResolvedValue(
    ((key: string) => `msg-${key}`) as never
  );
  doubles().agent.create.mockResolvedValue({ id: 'agent-1' });
  doubles().agent.update.mockResolvedValue({ id: 'agent-1' });
  doubles().agent.delete.mockResolvedValue({ id: 'agent-1' });
  doubles().auditLog.create.mockResolvedValue({});
  findUnique.mockResolvedValue({ id: 'agent-1' });
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

  it('does nothing for an unauthenticated admin', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null as never);
    const result = await deleteAgent('agent-1');

    expect(result).toEqual({ ok: false, error: 'unauthorized' });
    expect(doubles().agent.delete).not.toHaveBeenCalled();
    expect(revalidatedLocales()).toEqual([]);
  });
});
