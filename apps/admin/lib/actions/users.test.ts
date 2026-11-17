import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@colina/db';
import { requirePermission } from '../permissions';
import {
  deleteMachineInTransaction,
  deleteCategoryInTransaction,
} from '../entity-delete';
import { revalidateWebPaths } from '../revalidate-web';
import { createEditor, deleteAdminUser, resetEditorPassword } from './users';

vi.mock('@colina/db', () => {
  const txAdminUser = {
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    findUnique: vi.fn(),
  };
  const txAuditLog = {
    create: vi.fn(),
    deleteMany: vi.fn(),
    count: vi.fn(),
  };
  const txMachine = { findMany: vi.fn() };
  const txMachineCategory = { findMany: vi.fn() };
  const prisma = {
    $transaction: vi.fn((callback: (tx: unknown) => Promise<unknown>) =>
      callback({
        adminUser: txAdminUser,
        auditLog: txAuditLog,
        machine: txMachine,
        machineCategory: txMachineCategory,
      })
    ),
    adminUser: {
      findUnique: vi.fn(),
      count: vi.fn(),
    },
  };
  (prisma as Record<string, unknown>).txAdminUser = txAdminUser;
  (prisma as Record<string, unknown>).txAuditLog = txAuditLog;
  (prisma as Record<string, unknown>).txMachine = txMachine;
  (prisma as Record<string, unknown>).txMachineCategory = txMachineCategory;
  return { prisma };
});

vi.mock('argon2', () => ({
  default: {
    hash: vi.fn(async (value: string) => `hashed:${value}`),
  },
}));

vi.mock('../permissions', () => ({
  requirePermission: vi.fn(),
}));

vi.mock('../entity-delete', () => ({
  deleteMachineInTransaction: vi.fn(),
  deleteCategoryInTransaction: vi.fn(),
}));

vi.mock('../revalidate-web', () => ({
  revalidateWebPaths: vi.fn(),
}));

vi.mock('next/server', () => ({
  after: vi.fn((callback: () => unknown) => callback()),
}));

vi.mock('next-intl/server', () => ({
  getTranslations: vi.fn(async () => (key: string) => `msg-${key}`),
}));

const SESSION = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    name: 'Admin One',
    role: 'SUPER_ADMIN',
  },
};

const EDITOR_TARGET = {
  id: 'editor-1',
  name: 'Editor One',
  email: 'editor@example.com',
  role: 'EDITOR' as const,
};

const SUPER_TARGET = {
  id: 'admin-2',
  name: 'Second Admin',
  email: 'second@example.com',
  role: 'SUPER_ADMIN' as const,
};

const CREATE_INPUT = {
  name: 'New Editor',
  email: 'new-editor@example.com',
  password: 'correct-horse-battery',
};

const doubles = () => {
  const mock = prisma as unknown as Record<string, unknown>;
  return {
    adminUser: mock.txAdminUser as Record<string, ReturnType<typeof vi.fn>>,
    auditLog: mock.txAuditLog as Record<string, ReturnType<typeof vi.fn>>,
    machine: mock.txMachine as Record<string, ReturnType<typeof vi.fn>>,
    category: mock.txMachineCategory as Record<
      string,
      ReturnType<typeof vi.fn>
    >,
    outerFindUnique: prisma.adminUser.findUnique as unknown as ReturnType<
      typeof vi.fn
    >,
    outerCount: prisma.adminUser.count as unknown as ReturnType<typeof vi.fn>,
  };
};

const DELETE_INPUT = {
  id: EDITOR_TARGET.id,
  mode: 'account' as const,
  deleteContent: false,
  confirmEmail: '',
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requirePermission).mockResolvedValue(SESSION as never);

  doubles().adminUser.create.mockResolvedValue({
    id: 'editor-2',
    name: CREATE_INPUT.name,
    email: CREATE_INPUT.email,
    role: 'EDITOR',
  });
  doubles().adminUser.update.mockResolvedValue({});
  doubles().adminUser.delete.mockResolvedValue({});
  doubles().adminUser.findUnique.mockResolvedValue(EDITOR_TARGET);
  doubles().auditLog.create.mockResolvedValue({});
  doubles().auditLog.deleteMany.mockResolvedValue({ count: 3 });
  doubles().auditLog.count.mockResolvedValue(3);
  doubles().machine.findMany.mockResolvedValue([]);
  doubles().category.findMany.mockResolvedValue([]);
  doubles().outerFindUnique.mockResolvedValue(EDITOR_TARGET);
  doubles().outerCount.mockResolvedValue(1);
  vi.mocked(deleteMachineInTransaction).mockImplementation(async (_tx, id) => ({
    ok: true,
    slug: `${id}-slug`,
    categorySlug: 'cat',
  }));
  vi.mocked(deleteCategoryInTransaction).mockImplementation(
    async (_tx, id) => ({ ok: true, slug: `${id}-slug` })
  );
});

describe('createEditor', () => {
  it('refuses a caller without users:manage', async () => {
    vi.mocked(requirePermission).mockResolvedValue(null);

    await expect(createEditor(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      error: 'unauthorized',
    });
    expect(doubles().adminUser.create).not.toHaveBeenCalled();
  });

  it('rejects an invalid input before touching the database', async () => {
    const result = await createEditor({ ...CREATE_INPUT, password: 'short' });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('validation_failed');
      expect(result.issues?.[0]?.field).toBe('password');
    }
    expect(doubles().adminUser.create).not.toHaveBeenCalled();
  });

  it('creates an EDITOR with a hash and one USER_CREATE audit row', async () => {
    const result = await createEditor(CREATE_INPUT);

    expect(result).toEqual({ ok: true, id: 'editor-2' });
    const createData = doubles().adminUser.create.mock.calls[0][0].data;
    expect(createData).toMatchObject({
      role: 'EDITOR',
      name: CREATE_INPUT.name,
      email: CREATE_INPUT.email,
      passwordHash: `hashed:${CREATE_INPUT.password}`,
    });

    const audit = doubles().auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      adminUserId: 'admin-1',
      actorEmail: 'admin@example.com',
      actorName: 'Admin One',
      action: 'USER_CREATE',
      entity: 'AdminUser:editor-2',
    });
    expect(audit.details).toMatchObject({
      label: { en: CREATE_INPUT.email, ar: CREATE_INPUT.email },
      search: `${CREATE_INPUT.email} ${CREATE_INPUT.email}`,
    });
    expect(
      audit.details.changes.map((change: { field: string }) => change.field)
    ).toEqual(['name', 'email']);
    expect(JSON.stringify(audit)).not.toContain(CREATE_INPUT.password);
  });

  it('maps a unique email violation to email_taken', async () => {
    doubles().adminUser.create.mockRejectedValue({ code: 'P2002' });

    await expect(createEditor(CREATE_INPUT)).resolves.toEqual({
      ok: false,
      error: 'email_taken',
    });
  });
});

describe('resetEditorPassword', () => {
  const input = { id: 'editor-1', password: 'a-new-secure-password' };

  it('refuses a full-admin target', async () => {
    doubles().outerFindUnique.mockResolvedValue(SUPER_TARGET);

    await expect(resetEditorPassword(input)).resolves.toEqual({
      ok: false,
      error: 'protected_account',
    });
    expect(doubles().adminUser.update).not.toHaveBeenCalled();
  });

  it('returns not_found for a missing account', async () => {
    doubles().outerFindUnique.mockResolvedValue(null);

    await expect(resetEditorPassword(input)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
  });

  it('stores a new hash, revokes sessions and audits without the password', async () => {
    await expect(resetEditorPassword(input)).resolves.toEqual({ ok: true });

    const update = doubles().adminUser.update.mock.calls[0][0];
    expect(update.where).toEqual({ id: 'editor-1' });
    expect(update.data).toMatchObject({
      passwordHash: `hashed:${input.password}`,
      passwordResetTokenHash: null,
      passwordResetTokenExpiresAt: null,
      sessionVersion: { increment: 1 },
    });

    const audit = doubles().auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      adminUserId: 'admin-1',
      actorEmail: 'admin@example.com',
      action: 'USER_PASSWORD_RESET',
      entity: 'AdminUser:editor-1',
      details: {
        changes: [],
        label: { en: 'editor@example.com', ar: 'editor@example.com' },
      },
    });
    expect(JSON.stringify(audit)).not.toContain(input.password);
    expect(JSON.stringify(audit)).not.toContain('hashed:');
  });
});

describe('deleteAdminUser', () => {
  it('refuses to delete the acting account', async () => {
    doubles().outerFindUnique.mockResolvedValue({
      ...EDITOR_TARGET,
      id: SESSION.user.id,
    });

    await expect(
      deleteAdminUser({ ...DELETE_INPUT, id: SESSION.user.id })
    ).resolves.toEqual({ ok: false, error: 'self' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(doubles().adminUser.delete).not.toHaveBeenCalled();
  });

  it('refuses the last full admin', async () => {
    doubles().outerFindUnique.mockResolvedValue(SUPER_TARGET);
    doubles().outerCount.mockResolvedValue(1);

    await expect(
      deleteAdminUser({ ...DELETE_INPUT, id: SUPER_TARGET.id })
    ).resolves.toEqual({ ok: false, error: 'last_admin' });
    expect(doubles().adminUser.delete).not.toHaveBeenCalled();
  });

  it('refuses another full admin even when it is not the last one', async () => {
    doubles().outerFindUnique.mockResolvedValue(SUPER_TARGET);
    doubles().outerCount.mockResolvedValue(2);

    await expect(
      deleteAdminUser({ ...DELETE_INPUT, id: SUPER_TARGET.id })
    ).resolves.toEqual({ ok: false, error: 'protected_account' });
    expect(doubles().adminUser.delete).not.toHaveBeenCalled();
  });

  it('requires the typed email for mode B', async () => {
    await expect(
      deleteAdminUser({
        ...DELETE_INPUT,
        mode: 'account_and_audit',
        confirmEmail: 'wrong@example.com',
      })
    ).resolves.toEqual({ ok: false, error: 'email_mismatch' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('requires the typed email when content is selected', async () => {
    await expect(
      deleteAdminUser({
        ...DELETE_INPUT,
        deleteContent: true,
        confirmEmail: '',
      })
    ).resolves.toEqual({ ok: false, error: 'email_mismatch' });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mode A keeps audit rows and the content, writes one USER_DELETE row', async () => {
    const result = await deleteAdminUser(DELETE_INPUT);

    expect(result).toEqual({
      ok: true,
      removedAuditRows: 0,
      deletedMachines: 0,
      deletedCategories: 0,
      blockedCategories: [],
    });
    expect(doubles().auditLog.deleteMany).not.toHaveBeenCalled();
    expect(doubles().machine.findMany).not.toHaveBeenCalled();
    expect(doubles().category.findMany).not.toHaveBeenCalled();

    expect(doubles().adminUser.delete).toHaveBeenCalledWith({
      where: { id: 'editor-1' },
    });
    expect(doubles().auditLog.create).toHaveBeenCalledTimes(1);
    const audit = doubles().auditLog.create.mock.calls[0][0].data;
    expect(audit).toMatchObject({
      adminUserId: 'admin-1',
      actorEmail: 'admin@example.com',
      actorName: 'Admin One',
      action: 'USER_DELETE',
      entity: 'AdminUser:editor-1',
    });
    const fields = audit.details.changes.map(
      (change: { field: string; from: unknown }) => [change.field, change.from]
    );
    expect(fields).toEqual([
      ['name', 'Editor One'],
      ['email', 'editor@example.com'],
      ['mode', 'account'],
      ['auditRows', 0],
      ['machines', 0],
      ['categories', 0],
    ]);
  });

  it('mode B removes the target audit rows and reports the count', async () => {
    const result = await deleteAdminUser({
      ...DELETE_INPUT,
      mode: 'account_and_audit',
      confirmEmail: 'editor@example.com',
    });

    expect(result).toMatchObject({ ok: true, removedAuditRows: 3 });
    expect(doubles().auditLog.deleteMany).toHaveBeenCalledWith({
      where: { adminUserId: 'editor-1' },
    });
    expect(doubles().adminUser.delete).toHaveBeenCalled();
    const audit = doubles().auditLog.create.mock.calls[0][0].data;
    expect(audit.action).toBe('USER_DELETE');
    expect(audit.details.changes).toContainEqual(
      expect.objectContaining({ field: 'mode', from: 'account_and_audit' })
    );
  });

  it('deletes machines, then categories, and reports blocked categories', async () => {
    doubles().machine.findMany.mockResolvedValue([{ id: 'm1' }, { id: 'm2' }]);
    doubles().category.findMany.mockResolvedValue([
      { id: 'c1', nameEn: 'Free category', nameAr: 'فئة حرة' },
      { id: 'c2', nameEn: 'Busy category', nameAr: 'فئة مشغولة' },
    ]);
    vi.mocked(deleteMachineInTransaction).mockImplementation(async (_tx, id) =>
      id === 'm1'
        ? { ok: true, slug: 'm1-slug', categorySlug: 'm1-cat' }
        : { ok: true, slug: 'm2-slug', categorySlug: 'm2-cat' }
    );
    vi.mocked(deleteCategoryInTransaction).mockImplementation(
      async (_tx, id) =>
        id === 'c1'
          ? { ok: true, slug: 'c1-slug' }
          : { ok: false, error: 'has_machines', machineCount: 1 }
    );

    const result = await deleteAdminUser({
      ...DELETE_INPUT,
      mode: 'account_and_audit',
      deleteContent: true,
      confirmEmail: 'editor@example.com',
    });

    expect(result).toEqual({
      ok: true,
      removedAuditRows: 3,
      deletedMachines: 2,
      deletedCategories: 1,
      blockedCategories: [{ nameEn: 'Busy category', nameAr: 'فئة مشغولة' }],
    });
    expect(deleteMachineInTransaction).toHaveBeenCalledTimes(2);
    expect(deleteCategoryInTransaction).toHaveBeenCalledTimes(2);
    expect(deleteMachineInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'm1',
      SESSION
    );
    expect(deleteCategoryInTransaction).toHaveBeenNthCalledWith(
      1,
      expect.anything(),
      'c1',
      SESSION
    );

    expect(revalidateWebPaths).toHaveBeenCalledWith([
      '/',
      '/categories/m1-cat',
      '/machines/m1-slug',
      '/categories/m2-cat',
      '/machines/m2-slug',
      '/categories',
      '/categories/c1-slug',
    ]);

    const audit = doubles().auditLog.create.mock.calls[0][0].data;
    const counts = Object.fromEntries(
      audit.details.changes.map((change: { field: string; from: unknown }) => [
        change.field,
        change.from,
      ])
    );
    expect(counts).toMatchObject({
      mode: 'account_and_audit',
      auditRows: 3,
      machines: 2,
      categories: 1,
    });
    expect(JSON.stringify(audit)).not.toContain('password');
  });

  it('returns not_found when the account vanished before the transaction', async () => {
    doubles().adminUser.findUnique.mockResolvedValue(null);

    await expect(deleteAdminUser(DELETE_INPUT)).resolves.toEqual({
      ok: false,
      error: 'not_found',
    });
    expect(doubles().adminUser.delete).not.toHaveBeenCalled();
  });
});
