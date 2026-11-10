import { beforeEach, describe, expect, it, vi } from 'vitest';

// `auth.ts` imports the shared Prisma singleton at module load; the session
// policy test never queries it, and the authorize tests control the only
// delegate they reach. argon2 is stubbed so the assertions are about the
// verification *contract* (which hash is used), not native timing.
vi.mock('@colina/db', () => ({
  prisma: { adminUser: { findUnique: vi.fn() } },
  logSecurityEvent: vi.fn(),
}));

// The DB-backed limiter is covered by lib/rate-limit.test.ts; here only the
// authorize contract matters, so its decision is injected.
const { rateLimitCheck } = vi.hoisted(() => ({ rateLimitCheck: vi.fn() }));
vi.mock('./rate-limit', () => ({
  LOGIN_RATE_LIMIT: { maxAttempts: 10, windowMs: 15 * 60 * 1000 },
  getClientIp: vi.fn(() => '198.51.100.1'),
  rateLimitCheck,
}));

vi.mock('argon2', () => ({
  default: { verify: vi.fn(), hash: vi.fn() },
}));

import argon2 from 'argon2';
import { logSecurityEvent, prisma } from '@colina/db';
import { authOptions } from './auth';

type Authorize = (
  credentials: Record<string, string>,
  req: { headers: Record<string, string> }
) => Promise<unknown>;

// NextAuth's CredentialsProvider factory stores the configured callback on
// `options.authorize`; the core merges it in at request time. Call the
// configured one directly so this test exercises our code, not the
// provider's default `() => null`.
const provider = authOptions.providers[0] as unknown as {
  authorize: Authorize;
  options?: { authorize?: Authorize };
};
const authorize = provider.options?.authorize ?? provider.authorize;

function attempt(email: string, password: string, ip: string) {
  return authorize(
    { email, password },
    { headers: { 'x-forwarded-for': ip } }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  rateLimitCheck.mockResolvedValue(0);
});

describe('admin session policy', () => {
  it('expires the JWT session after 8 hours', () => {
    expect(authOptions.session?.maxAge).toBe(8 * 60 * 60);
  });

  it('uses an httpOnly, SameSite=Lax session cookie', () => {
    expect(authOptions.cookies?.sessionToken).toMatchObject({
      name: 'next-auth.session-token',
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: false,
      },
    });
  });

  it('keeps Secure cookies off in the dev/test environment', () => {
    expect(authOptions.useSecureCookies).toBe(false);
  });
});

describe('credentials authorize: no account enumeration', () => {
  it('spends an argon2 verification even when the email does not exist', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(null);
    vi.mocked(argon2.verify).mockResolvedValue(false);

    const result = await attempt(
      'nobody@example.com',
      'wrong-password',
      '198.51.100.1'
    );

    expect(result).toBeNull();
    expect(argon2.verify).toHaveBeenCalledTimes(1);
    const [hash, password] = vi.mocked(argon2.verify).mock.calls[0];
    // A real argon2id hash, not the empty/short-circuit path.
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(password).toBe('wrong-password');
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGIN_FAILED' })
    );
  });

  it('verifies the stored hash when the email exists', async () => {
    const user = {
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash: '$argon2id$stored-hash',
      role: 'SUPER_ADMIN',
      sessionVersion: 3,
    };
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue(user as never);
    vi.mocked(argon2.verify).mockResolvedValue(true);

    const result = await attempt(
      user.email,
      'right-password',
      '198.51.100.2'
    );

    expect(result).toEqual({
      id: 'admin-1',
      email: 'admin@example.com',
      role: 'SUPER_ADMIN',
      sessionVersion: 3,
    });
    expect(argon2.verify).toHaveBeenCalledWith(
      user.passwordHash,
      'right-password'
    );
  });

  it('answers a wrong password the same way as an unknown email', async () => {
    vi.mocked(prisma.adminUser.findUnique).mockResolvedValue({
      id: 'admin-1',
      email: 'admin@example.com',
      passwordHash: '$argon2id$stored-hash',
      role: 'SUPER_ADMIN',
    } as never);
    vi.mocked(argon2.verify).mockResolvedValue(false);

    const result = await attempt(
      'admin@example.com',
      'wrong-password',
      '198.51.100.3'
    );

    expect(result).toBeNull();
    expect(logSecurityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'LOGIN_FAILED' })
    );
  });

  it('logs RATE_LIMITED and throws the generic failure when over the limit', async () => {
    rateLimitCheck.mockResolvedValue(30);

    await expect(
      attempt('admin@example.com', 'wrong-password', '198.51.100.4')
    ).rejects.toThrow('Invalid email or password.');

    expect(prisma.adminUser.findUnique).not.toHaveBeenCalled();
    expect(logSecurityEvent).toHaveBeenCalledWith({
      type: 'RATE_LIMITED',
      source: 'admin-login',
      ip: '198.51.100.1',
      detail: 'retry-after: 30s',
    });
  });
});
