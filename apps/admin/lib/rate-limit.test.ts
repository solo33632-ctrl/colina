import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { queryRaw, deleteMany } = vi.hoisted(() => ({
  queryRaw: vi.fn(),
  deleteMany: vi.fn(),
}));

vi.mock('@colina/db', () => ({
  prisma: {
    $queryRaw: queryRaw,
    rateLimitBucket: { deleteMany },
  },
}));

import {
  LOGIN_RATE_LIMIT,
  PASSWORD_RESET_RATE_LIMIT,
  rateLimitCheck,
} from './rate-limit';

// Window boundary used by every test. Epoch-aligned for the 15-minute
// windows (`900_000` divides it exactly).
const BASE = 90_000_000;

let random: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.clearAllMocks();
  queryRaw.mockResolvedValue([{ count: 1 }]);
  deleteMany.mockResolvedValue({ count: 0 });
  // Keep opportunistic cleanup out of tests that are not about it.
  random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
});

afterEach(() => {
  random.mockRestore();
  vi.restoreAllMocks();
});

describe('rateLimitCheck with the login policy', () => {
  it('allows up to the max, then blocks with whole retry seconds', async () => {
    const key = 'login:198.51.100.7';
    const now = BASE + 1_000;

    queryRaw.mockResolvedValue([{ count: LOGIN_RATE_LIMIT.maxAttempts }]);
    await expect(rateLimitCheck(key, LOGIN_RATE_LIMIT, now)).resolves.toBe(0);

    queryRaw.mockResolvedValue([{ count: LOGIN_RATE_LIMIT.maxAttempts + 1 }]);
    const retryAfter = await rateLimitCheck(key, LOGIN_RATE_LIMIT, now);
    expect(retryAfter).toBeGreaterThan(0);
    expect(retryAfter).toBe(
      Math.ceil(LOGIN_RATE_LIMIT.windowMs / 1000) - 1 // now is 1s in
    );
  });

  it('recovers in a new window', async () => {
    const key = 'login:198.51.100.8';
    queryRaw.mockResolvedValueOnce([{ count: LOGIN_RATE_LIMIT.maxAttempts }]);
    await expect(
      rateLimitCheck(key, LOGIN_RATE_LIMIT, BASE + 1_000)
    ).resolves.toBe(0);

    // Next window: the atomic upsert starts a fresh row at count 1.
    queryRaw.mockResolvedValueOnce([{ count: 1 }]);
    await expect(
      rateLimitCheck(
        key,
        LOGIN_RATE_LIMIT,
        BASE + LOGIN_RATE_LIMIT.windowMs + 1_000
      )
    ).resolves.toBe(0);

    const firstWindow = queryRaw.mock.calls[0][2] as Date;
    const secondWindow = queryRaw.mock.calls[1][2] as Date;
    expect(secondWindow.getTime() - firstWindow.getTime()).toBe(
      LOGIN_RATE_LIMIT.windowMs
    );
  });
});

describe('rateLimitCheck with the password-reset policy', () => {
  it('enforces its own tighter budget independently', async () => {
    const key = 'forgot:198.51.100.9';

    queryRaw.mockResolvedValue([
      { count: PASSWORD_RESET_RATE_LIMIT.maxAttempts },
    ]);
    await expect(
      rateLimitCheck(key, PASSWORD_RESET_RATE_LIMIT, BASE)
    ).resolves.toBe(0);

    queryRaw.mockResolvedValue([
      { count: PASSWORD_RESET_RATE_LIMIT.maxAttempts + 1 },
    ]);
    await expect(
      rateLimitCheck(key, PASSWORD_RESET_RATE_LIMIT, BASE)
    ).resolves.toBeGreaterThan(0);
  });
});

describe('durable storage', () => {
  it('hashes the key and passes a fixed window start', async () => {
    const rawKey = 'login:203.0.113.77';
    await rateLimitCheck(rawKey, LOGIN_RATE_LIMIT, BASE + 123_456);

    const [, hashedKey, windowStart] = queryRaw.mock.calls[0];
    expect(hashedKey).toMatch(/^[a-f0-9]{64}$/);
    expect(hashedKey).not.toContain(rawKey);
    expect(windowStart).toBeInstanceOf(Date);
    expect((windowStart as Date).getTime()).toBe(
      BASE + Math.floor(123_456 / LOGIN_RATE_LIMIT.windowMs) *
        LOGIN_RATE_LIMIT.windowMs
    );
  });

  it('uses one INSERT ... ON CONFLICT ... RETURNING statement', async () => {
    await rateLimitCheck('login:203.0.113.78', LOGIN_RATE_LIMIT, BASE);
    const strings = queryRaw.mock.calls[0][0] as TemplateStringsArray;
    const sql = strings.join('?').replace(/\s+/g, ' ');
    expect(sql).toContain('INSERT INTO "RateLimitBucket"');
    expect(sql).toContain('ON CONFLICT ("key", "windowStart")');
    expect(sql).toContain('"count" = "RateLimitBucket"."count" + 1');
    expect(sql).toContain('RETURNING "count"');
  });

  it('deletes old windows on the low-probability cleanup path only', async () => {
    random.mockReturnValueOnce(0);
    await rateLimitCheck('login:203.0.113.79', LOGIN_RATE_LIMIT, BASE);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { windowStart: { lt: expect.any(Date) } },
    });

    deleteMany.mockClear();
    random.mockReturnValueOnce(0.99);
    await rateLimitCheck('login:203.0.113.80', LOGIN_RATE_LIMIT, BASE);
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

describe('failure policy', () => {
  it('fails closed and logs server-side when the database is unreachable', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    queryRaw.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const retryAfter = await rateLimitCheck(
      'login:203.0.113.81',
      LOGIN_RATE_LIMIT,
      BASE
    );

    expect(retryAfter).toBe(LOGIN_RATE_LIMIT.windowMs / 1000);
    expect(error).toHaveBeenCalledWith(
      '[rate-limit] durable check failed; failing closed:',
      'connect ECONNREFUSED'
    );
  });
});
