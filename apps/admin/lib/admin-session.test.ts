import { beforeEach, describe, expect, it, vi } from 'vitest';

// The decision logic under test is DB-backed; mock the two boundaries — the
// cookie/JWT session and the AdminUser lookup — so each rejection cause can
// be stated exactly, without a database or a real cookie.
const { getAdminSession, findUnique } = vi.hoisted(() => ({
  getAdminSession: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('./auth', () => ({ getAdminSession }));
vi.mock('@colina/db', () => ({
  prisma: { adminUser: { findUnique } },
}));

import {
  getVerifiedAdminSession,
  requireAdmin,
  requireSuperAdmin,
} from './admin-action';

const DB_USER = {
  id: 'admin-1',
  email: 'admin@example.com',
  role: 'SUPER_ADMIN' as const,
  sessionVersion: 4,
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    user: {
      id: DB_USER.id,
      email: DB_USER.email,
      role: DB_USER.role,
      sessionVersion: DB_USER.sessionVersion,
      ...overrides,
    },
    expires: '2099-01-01T00:00:00.000Z',
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  findUnique.mockResolvedValue(DB_USER);
});

describe('getVerifiedAdminSession', () => {
  it('rejects a request with no session at all', async () => {
    getAdminSession.mockResolvedValue(null);
    await expect(getVerifiedAdminSession()).resolves.toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects a token issued before sessionVersion existed', async () => {
    getAdminSession.mockResolvedValue(session({ sessionVersion: undefined }));
    await expect(getVerifiedAdminSession()).resolves.toBeNull();
    // Old tokens are refused without touching the database: the claim is the
    // first half of the comparison and it is missing.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it('rejects when the user no longer exists', async () => {
    getAdminSession.mockResolvedValue(session());
    findUnique.mockResolvedValue(null);
    await expect(getVerifiedAdminSession()).resolves.toBeNull();
  });

  it('rejects a version mismatch (password reset revoked the token)', async () => {
    getAdminSession.mockResolvedValue(session());
    findUnique.mockResolvedValue({ ...DB_USER, sessionVersion: 5 });
    await expect(getVerifiedAdminSession()).resolves.toBeNull();
  });

  it('rejects a role mismatch (role changed after sign-in)', async () => {
    getAdminSession.mockResolvedValue(session({ role: 'EDITOR' }));
    findUnique.mockResolvedValue({ ...DB_USER, role: 'SUPER_ADMIN' });
    await expect(getVerifiedAdminSession()).resolves.toBeNull();
  });

  it('accepts a matching user, version and role', async () => {
    getAdminSession.mockResolvedValue(session());
    await expect(getVerifiedAdminSession()).resolves.toEqual({
      user: {
        id: DB_USER.id,
        email: DB_USER.email,
        role: DB_USER.role,
      },
    });
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: DB_USER.id },
      select: { id: true, email: true, role: true, sessionVersion: true },
    });
  });
});

describe('requireAdmin / requireSuperAdmin', () => {
  it('requireAdmin rejects the same null result for a revoked session', async () => {
    getAdminSession.mockResolvedValue(session());
    findUnique.mockResolvedValue({ ...DB_USER, sessionVersion: 99 });
    await expect(requireAdmin()).resolves.toBeNull();
  });

  it('requireSuperAdmin keeps the role gate on the verified role', async () => {
    getAdminSession.mockResolvedValue(session({ role: 'EDITOR' }));
    findUnique.mockResolvedValue({ ...DB_USER, role: 'EDITOR' });
    await expect(requireSuperAdmin()).resolves.toBeNull();

    getAdminSession.mockResolvedValue(session());
    findUnique.mockResolvedValue(DB_USER);
    await expect(requireSuperAdmin()).resolves.toMatchObject({
      user: { id: DB_USER.id, role: 'SUPER_ADMIN' },
    });
  });
});
