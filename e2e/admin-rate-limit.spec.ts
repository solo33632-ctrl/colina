import { test, expect } from '@playwright/test';
import { ADMIN_URL, copyFor } from './admin-session';
import {
  DATABASE_URL,
  resetRateLimitBuckets,
  runInDbValue,
} from './db-fixture';

// Stage 2c: the login limiter is durable, not per-process. This test spends
// the real budget with wrong passwords (no production limit is weakened),
// proves the 11th attempt still gets the same generic credential error, and
// checks the bucket/key rows directly in the test database. It resets the
// buckets in `finally`, because every later spec shares the same e2e IP.
//
// `LOGIN_RATE_LIMIT.maxAttempts` is 10 (apps/admin/lib/rate-limit.ts). It is
// duplicated here as a literal so the Playwright process does not import the
// Prisma-backed server module; if the policy changes, this test should change
// with it.
const LOGIN_MAX_ATTEMPTS = 10;

test.describe('durable login rate limit', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL env is required');

  test('the 11th wrong password is blocked generically and leaves a bucket', async ({
    page,
  }) => {
    const en = copyFor('en');
    resetRateLimitBuckets();

    try {
      await page.goto(`${ADMIN_URL}/en/login`);

      for (let attempt = 1; attempt <= LOGIN_MAX_ATTEMPTS + 1; attempt++) {
        await page.getByLabel(en.email).fill('rate-limit-e2e@example.com');
        await page.getByLabel(en.password).fill('wrong-password-for-2c');

        const response = page.waitForResponse(
          (res) =>
            res.url().includes('/api/auth/callback/credentials') &&
            res.request().method() === 'POST'
        );
        await page.getByRole('button', { name: en.submit }).click();
        await response;

        // Every attempt — allowed or throttled — gets the same generic copy
        // and stays on the login page. The throttle must not be observable.
        await expect(page.getByText(en.invalid)).toBeVisible();
        await expect(page).toHaveURL(new RegExp('/en/login$'));
      }

      const state = runInDbValue<{
        buckets: number;
        rateLimitedEvents: number;
        sampleKey: string | null;
      }>(`
        return {
          buckets: await prisma.rateLimitBucket.count(),
          rateLimitedEvents: await prisma.securityEvent.count({
            where: {
              type: 'RATE_LIMITED',
              source: 'admin-login',
              createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) },
            },
          }),
          sampleKey: (await prisma.rateLimitBucket.findFirst())?.key ?? null,
        };
      `);

      expect(state?.buckets ?? 0).toBeGreaterThanOrEqual(1);
      expect(state?.rateLimitedEvents ?? 0).toBeGreaterThanOrEqual(1);
      // The stored key is a SHA-256 hash, never the attempted email or IP.
      expect(state?.sampleKey).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      resetRateLimitBuckets();
    }
  });
});
