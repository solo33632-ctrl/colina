import { beforeEach, describe, expect, it, vi } from 'vitest';
import { revalidatePath } from 'next/cache';
import { prisma } from '@colina/db';
import { requireAdmin } from '../admin-action';
import { deleteLead, deleteLeads } from './leads';

// Delete-action contract tests. Prisma is replaced by a small in-memory
// double so the transaction boundary, the delete counts and the audit payload
// can be inspected without a database; auth and revalidation are mocked so
// each test sees exactly one concern.
vi.mock('@colina/db', () => ({
  prisma: { $transaction: vi.fn() },
}));

vi.mock('../admin-action', () => ({
  requireAdmin: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const SESSION = {
  user: { id: 'admin-1', email: 'admin@example.com', role: 'SUPER_ADMIN' },
};

const CONTACT_RECEIVED = new Date('2026-03-01T10:00:00.000Z');
const REQUEST_RECEIVED = new Date('2026-03-02T11:30:00.000Z');

// Deliberately fuller than the real `select`: if any field other than the id
// and timestamp reached the audit helper, the PII assertions below would catch
// it. This makes the test prove the helper's shape, not Prisma's projection.
type FakeRow = {
  id: string;
  createdAt: Date;
  name: string;
  phone: string;
  email: string;
  message: string;
  company?: string;
  machineModel?: string;
};

const contactRow = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  id: 'contact-1',
  createdAt: CONTACT_RECEIVED,
  name: 'Private Contact Name',
  phone: '+20 100 000 0000',
  email: 'private-contact@example.com',
  message: 'Private contact message body',
  ...overrides,
});

const requestRow = (overrides: Partial<FakeRow> = {}): FakeRow => ({
  id: 'request-1',
  createdAt: REQUEST_RECEIVED,
  name: 'Private Request Name',
  company: 'Private Company',
  phone: '+20 100 000 0001',
  email: 'private-request@example.com',
  message: 'Private maintenance message body',
  machineModel: 'Private Machine',
  ...overrides,
});

type FakeState = { contacts: FakeRow[]; requests: FakeRow[] };

function makeTx(state: FakeState) {
  const idsFrom = (where: { id: { in: string[] } }) => new Set(where.id.in);

  const findContacts = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      state.contacts.filter((row) => idsFrom(where).has(row.id))
  );
  const findRequests = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) =>
      state.requests.filter((row) => idsFrom(where).has(row.id))
  );
  const deleteContacts = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: state.contacts.filter((row) => idsFrom(where).has(row.id)).length,
    })
  );
  const deleteRequests = vi.fn(
    async ({ where }: { where: { id: { in: string[] } } }) => ({
      count: state.requests.filter((row) => idsFrom(where).has(row.id)).length,
    })
  );
  const createAudit = vi.fn(
    async (args: {
      data: { adminUserId: string; action: string; entity: string };
    }) => ({ id: 'audit-1', ...args.data })
  );

  const tx = {
    contactMessage: {
      findMany: findContacts,
      deleteMany: deleteContacts,
    },
    maintenanceRequest: {
      findMany: findRequests,
      deleteMany: deleteRequests,
    },
    auditLog: { create: createAudit },
  };

  return {
    tx,
    findContacts,
    findRequests,
    deleteContacts,
    deleteRequests,
    createAudit,
  };
}

function useTx(state: FakeState) {
  const fake = makeTx(state);
  vi.mocked(prisma.$transaction).mockImplementation((async (
    callback: (tx: typeof fake.tx) => unknown
  ) => callback(fake.tx)) as never);
  return fake;
}

function auditData(fake: ReturnType<typeof makeTx>) {
  expect(fake.createAudit).toHaveBeenCalledTimes(1);
  return fake.createAudit.mock.calls[0]?.[0] as unknown as {
    data: { adminUserId: string; action: string; entity: string };
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireAdmin).mockResolvedValue(SESSION as never);
});

describe('delete actions: authentication', () => {
  it('refuses deleteLead without an admin session', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);

    await expect(
      deleteLead({ kind: 'contact', id: 'contact-1' })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('refuses deleteLeads without an admin session', async () => {
    vi.mocked(requireAdmin).mockResolvedValue(null);

    await expect(
      deleteLeads({ items: [{ kind: 'contact', id: 'contact-1' }] })
    ).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('allows an authenticated EDITOR, since editors own the leads inbox', async () => {
    vi.mocked(requireAdmin).mockResolvedValue({
      user: { id: 'editor-1', email: 'editor@example.com', role: 'EDITOR' },
    } as never);
    const fake = useTx({ contacts: [contactRow()], requests: [] });

    await expect(
      deleteLead({ kind: 'contact', id: 'contact-1' })
    ).resolves.toEqual({ ok: true, deleted: 1, skipped: 0 });
    expect(auditData(fake).data.adminUserId).toBe('editor-1');
  });
});

describe('delete actions: validation', () => {
  it('rejects an unknown lead kind before opening a transaction', async () => {
    for (const kind of ['quote', 'Contact', '', null]) {
      await expect(
        deleteLead({ kind, id: 'contact-1' })
      ).resolves.toEqual({ ok: false, error: 'validation_failed' });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects a blank or oversized id', async () => {
    for (const id of ['', '   ', 'x'.repeat(65), 42]) {
      await expect(
        deleteLead({ kind: 'contact', id })
      ).resolves.toEqual({ ok: false, error: 'validation_failed' });
    }
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects an empty bulk selection', async () => {
    await expect(deleteLeads({ items: [] })).resolves.toEqual({
      ok: false,
      error: 'validation_failed',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('rejects more than 50 bulk targets', async () => {
    const items = Array.from({ length: 51 }, (_, index) => ({
      kind: 'contact' as const,
      id: `contact-${index}`,
    }));

    await expect(deleteLeads({ items })).resolves.toEqual({
      ok: false,
      error: 'validation_failed',
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('accepts exactly 50 bulk targets', async () => {
    const items = Array.from({ length: 50 }, (_, index) => ({
      kind: 'contact' as const,
      id: `contact-${index}`,
    }));
    useTx({ contacts: [], requests: [] });

    await expect(deleteLeads({ items })).resolves.toEqual({
      ok: true,
      deleted: 0,
      skipped: 50,
    });
  });
});

describe('delete actions: deletion and skipped ids', () => {
  it('deletes an existing contact and reports the count', async () => {
    const fake = useTx({ contacts: [contactRow()], requests: [] });

    await expect(
      deleteLead({ kind: 'contact', id: 'contact-1' })
    ).resolves.toEqual({ ok: true, deleted: 1, skipped: 0 });
    expect(fake.deleteContacts).toHaveBeenCalledWith({
      where: { id: { in: ['contact-1'] } },
    });
    expect(fake.deleteRequests).toHaveBeenCalledWith({
      where: { id: { in: [] } },
    });
  });

  it('skips ids that no longer exist and still writes one audit entry', async () => {
    const fake = useTx({ contacts: [contactRow()], requests: [] });

    await expect(
      deleteLeads({
        items: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'contact', id: 'gone-contact' },
          { kind: 'maintenance', id: 'gone-request' },
        ],
      })
    ).resolves.toEqual({ ok: true, deleted: 1, skipped: 2 });

    const { data } = auditData(fake);
    expect(data.action).toBe('DELETE');
    expect(data.entity).toBe(
      'Lead requested=3 deleted=1 skipped=2 items=' +
        `contact:contact-1@${CONTACT_RECEIVED.toISOString()},` +
        'contact:gone-contact@skipped,maintenance:gone-request@skipped'
    );
  });

  it('writes an audit entry for an all-skipped no-op call', async () => {
    const fake = useTx({ contacts: [], requests: [] });

    await expect(
      deleteLeads({ items: [{ kind: 'maintenance', id: 'already-gone' }] })
    ).resolves.toEqual({ ok: true, deleted: 0, skipped: 1 });

    expect(auditData(fake).data.entity).toBe(
      'Lead requested=1 deleted=0 skipped=1 items=maintenance:already-gone@skipped'
    );
    // Nothing changed, so nothing needs revalidating.
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it('deletes across both lead tables in one transaction and one audit entry', async () => {
    const fake = useTx({
      contacts: [
        contactRow({ id: 'contact-1' }),
        contactRow({ id: 'contact-2' }),
      ],
      requests: [requestRow({ id: 'request-1' })],
    });

    await expect(
      deleteLeads({
        items: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'maintenance', id: 'request-1' },
          { kind: 'contact', id: 'contact-2' },
        ],
      })
    ).resolves.toEqual({ ok: true, deleted: 3, skipped: 0 });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(fake.deleteContacts).toHaveBeenCalledWith({
      where: { id: { in: ['contact-1', 'contact-2'] } },
    });
    expect(fake.deleteRequests).toHaveBeenCalledWith({
      where: { id: { in: ['request-1'] } },
    });

    const { data } = auditData(fake);
    expect(data.entity).toBe(
      'Lead requested=3 deleted=3 skipped=0 items=' +
        `contact:contact-1@${CONTACT_RECEIVED.toISOString()},` +
        `maintenance:request-1@${REQUEST_RECEIVED.toISOString()},` +
        `contact:contact-2@${CONTACT_RECEIVED.toISOString()}`
    );
  });

  it('deduplicates repeated targets so one row is never counted twice', async () => {
    const fake = useTx({
      contacts: [contactRow()],
      requests: [requestRow()],
    });

    await expect(
      deleteLeads({
        items: [
          { kind: 'contact', id: 'contact-1' },
          { kind: 'contact', id: 'contact-1' },
          { kind: 'maintenance', id: 'request-1' },
        ],
      })
    ).resolves.toEqual({ ok: true, deleted: 2, skipped: 0 });
    expect(auditData(fake).data.entity).toContain('requested=2');
    expect(auditData(fake).data.entity).not.toContain('contact-1,');
  });
});

describe('delete actions: audit payload', () => {
  it('selects only ids and timestamps from the delete transaction', async () => {
    const fake = useTx({
      contacts: [contactRow()],
      requests: [requestRow()],
    });

    await deleteLeads({
      items: [
        { kind: 'contact', id: 'contact-1' },
        { kind: 'maintenance', id: 'request-1' },
      ],
    });

    for (const [find, id] of [
      [fake.findContacts, 'contact-1'],
      [fake.findRequests, 'request-1'],
    ] as const) {
      expect(find).toHaveBeenCalledWith({
        where: { id: { in: [id] } },
        select: { id: true, createdAt: true },
      });
    }
  });

  it('never includes names, phones, emails, companies, machines or messages', async () => {
    const fake = useTx({
      contacts: [contactRow()],
      requests: [requestRow()],
    });

    await deleteLeads({
      items: [
        { kind: 'contact', id: 'contact-1' },
        { kind: 'maintenance', id: 'request-1' },
      ],
    });

    const { entity } = auditData(fake).data;
    for (const secret of [
      'Private Contact Name',
      'Private Request Name',
      'Private Company',
      'Private Machine',
      '+20 100 000 0000',
      '+20 100 000 0001',
      'private-contact@example.com',
      'private-request@example.com',
      'Private contact message body',
      'Private maintenance message body',
    ]) {
      expect(entity).not.toContain(secret);
    }
  });

  it('revalidates both locales after a real deletion', async () => {
    useTx({ contacts: [contactRow()], requests: [] });

    await deleteLead({ kind: 'contact', id: 'contact-1' });

    expect(revalidatePath).toHaveBeenCalledWith('/ar', 'layout');
    expect(revalidatePath).toHaveBeenCalledWith('/en', 'layout');
  });
});

describe('delete actions: database failures', () => {
  it('maps a transaction failure to server_error without leaking details', async () => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    vi.mocked(prisma.$transaction).mockRejectedValue(
      new Error('connect ECONNREFUSED db.internal:5432')
    );

    await expect(
      deleteLead({ kind: 'contact', id: 'contact-1' })
    ).resolves.toEqual({ ok: false, error: 'server_error' });
    expect(revalidatePath).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});
