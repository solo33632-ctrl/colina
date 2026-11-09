import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// The forgot route defers account work with next/server's `after`. Capture
// the callbacks so the tests can prove the response is sent before the
// lookup/email work runs, then execute them explicitly.
const { scheduled, db } = vi.hoisted(() => ({
  scheduled: [] as Array<() => Promise<void> | void>,
  db: {
    findUnique: vi.fn(),
    findFirst: vi.fn(),
    update: vi.fn(),
  },
}));

vi.mock('next/server', async (importOriginal) => {
  const actual = await importOriginal<typeof import('next/server')>();
  return {
    ...actual,
    after: vi.fn((callback: () => Promise<void> | void) => {
      scheduled.push(callback);
    }),
  };
});

vi.mock('@colina/db', () => ({
  prisma: {
    adminUser: {
      findUnique: db.findUnique,
      findFirst: db.findFirst,
      update: db.update,
    },
  },
}));

vi.mock('@/lib/mail', () => ({
  sendAdminEmail: vi.fn(async () => true),
}));

vi.mock('argon2', () => ({
  default: { hash: vi.fn(async () => 'hashed-password') },
}));

import { prisma } from '@colina/db';
import { sendAdminEmail } from '@/lib/mail';
import { POST as forgotPassword } from '@/app/api/auth/forgot-password/route';
import { POST as resetPassword } from '@/app/api/auth/reset-password/route';

function jsonRequest(path: string, body: unknown, ip: string) {
  return new NextRequest(`http://localhost:3001${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-forwarded-for': ip,
    },
    body: JSON.stringify(body),
  });
}

function forgot(email: string, ip: string) {
  return forgotPassword(
    jsonRequest('/api/auth/forgot-password', { email }, ip)
  );
}

function reset(token: string, ip: string) {
  return resetPassword(
    jsonRequest(
      '/api/auth/reset-password',
      { token, password: 'correct horse battery staple' },
      ip
    )
  );
}

async function runScheduled() {
  for (const callback of scheduled.splice(0)) {
    await callback();
  }
}

beforeEach(() => {
  scheduled.length = 0;
  vi.clearAllMocks();
  process.env.NEXTAUTH_URL = 'http://localhost:3001';
});

describe('forgot-password: no account or timing oracle', () => {
  it('returns the same 200 response for an unknown and an existing email', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);
    const missing = await forgot('missing@example.com', '10.10.0.1');

    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
    } as never);
    const existing = await forgot('admin@example.com', '10.10.0.2');

    expect(missing.status).toBe(existing.status);
    expect(await missing.json()).toEqual(await existing.json());
    // Neither response waited for the lookup/update/mail work.
    expect(sendAdminEmail).not.toHaveBeenCalled();
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
  });

  it('does the token and email work only for an existing account, after the response', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
    } as never);

    const res = await forgot('admin@example.com', '10.10.0.3');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(sendAdminEmail).not.toHaveBeenCalled();

    await runScheduled();

    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        passwordResetTokenHash: expect.any(String),
        passwordResetTokenExpiresAt: expect.any(Date),
      },
    });
    const mail = vi.mocked(sendAdminEmail).mock.calls[0][0];
    expect(mail.to).toBe('admin@example.com');
    expect(mail.text).toMatch(
      /http:\/\/localhost:3001\/reset-password\?token=[a-f0-9]{64}/
    );
  });

  it('swallows a lookup failure after the response (no leak, no rejection)', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockRejectedValue(
      new Error('relation "AdminUser" does not exist')
    );

    const res = await forgot('admin@example.com', '10.10.0.4');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    await expect(runScheduled()).resolves.toBeUndefined();
    expect(prisma.adminUser.update).not.toHaveBeenCalled();
    expect(sendAdminEmail).not.toHaveBeenCalled();
  });
});

describe('reset-password: generic failures', () => {
  it('answers unknown/expired tokens identically', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue(null);

    const res = await reset('unknown-or-expired-token', '10.10.0.10');
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      ok: false,
      error: 'invalid_token',
    });
  });

  it('maps an unexpected database failure to server_error without DB text', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockRejectedValue(
      new Error('column AdminUser.passwordHash does not exist')
    );

    const res = await reset('any-token', '10.10.0.11');
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ ok: false, error: 'server_error' });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|AdminUser|column/i);
  });

  it('rotates the password and burns the token for a valid token', async () => {
    vi.mocked(prisma.adminUser.findFirst).mockResolvedValue({
      id: 'admin-1',
    } as never);

    const res = await reset('valid-token', '10.10.0.12');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(prisma.adminUser.update).toHaveBeenCalledWith({
      where: { id: 'admin-1' },
      data: {
        passwordHash: 'hashed-password',
        passwordResetTokenHash: null,
        passwordResetTokenExpiresAt: null,
      },
    });
  });
});
