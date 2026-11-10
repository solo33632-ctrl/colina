import { test, expect, type APIRequestContext } from '@playwright/test';
import { ADMIN_URL } from './admin-session';
import {
  DATABASE_URL,
  resetRateLimitBuckets,
} from './db-fixture';

// Stage 2c: the two public auth POST routes refuse a foreign (or missing)
// Origin with a generic empty 403, while the real forms still submit from
// the app's own origin. The credential sign-in endpoint is not listed here:
// Auth.js already enforces its own CSRF token on that callback.

const FORGOT = '/api/auth/forgot-password';
const RESET = '/api/auth/reset-password';

function postJson(
  request: APIRequestContext,
  path: string,
  body: unknown,
  origin: string | null
) {
  return request.post(`${ADMIN_URL}${path}`, {
    data: body,
    headers: origin ? { origin } : {},
  });
}

test.describe('auth POST origin check', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL env is required');

  test.beforeAll(() => {
    resetRateLimitBuckets();
  });

  test.afterAll(() => {
    resetRateLimitBuckets();
  });

  test('matching origin accepted, foreign and absent origins rejected', async ({
    request,
  }) => {
    const forgotBody = { email: 'origin-e2e@example.com' };
    const resetBody = {
      token: 'origin-e2e-invalid-token',
      password: 'correct horse battery staple',
    };

    const acceptedForgot = await postJson(request, FORGOT, forgotBody, ADMIN_URL);
    expect(acceptedForgot.status()).toBe(200);
    expect(await acceptedForgot.json()).toEqual({ ok: true });

    const acceptedReset = await postJson(request, RESET, resetBody, ADMIN_URL);
    expect(acceptedReset.status()).toBe(400);
    expect(await acceptedReset.json()).toEqual({
      ok: false,
      error: 'invalid_token',
    });

    for (const [path, body] of [
      [FORGOT, forgotBody],
      [RESET, resetBody],
    ] as const) {
      const foreign = await postJson(
        request,
        path,
        body,
        'https://evil.test'
      );
      expect(foreign.status(), `${path} foreign origin`).toBe(403);
      expect(await foreign.text()).toBe('');

      const absent = await postJson(request, path, body, null);
      expect(absent.status(), `${path} absent origin`).toBe(403);
      expect(await absent.text()).toBe('');
    }
  });

  test('the real forgot and reset forms still submit from the app', async ({
    page,
  }) => {
    await page.goto(`${ADMIN_URL}/en/forgot-password`);
    await page.getByLabel('Email').fill('origin-e2e@example.com');

    const forgotResponse = page.waitForResponse(
      (res) =>
        res.url().includes(FORGOT) && res.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Send reset link' }).click();
    expect((await forgotResponse).status()).toBe(200);
    await expect(
      page.getByText(
        'If that email belongs to an admin account, a reset link is on its way.'
      )
    ).toBeVisible();

    await page.goto(
      `${ADMIN_URL}/en/reset-password?token=origin-e2e-invalid-token`
    );
    await page
      .getByLabel('New password', { exact: true })
      .fill('correct horse battery staple');
    await page
      .getByLabel('Confirm new password', { exact: true })
      .fill('correct horse battery staple');

    const resetResponse = page.waitForResponse(
      (res) => res.url().includes(RESET) && res.request().method() === 'POST'
    );
    await page.getByRole('button', { name: 'Set new password' }).click();
    // 400 (invalid token), never 403: the browser's Origin was accepted.
    expect((await resetResponse).status()).toBe(400);
    await expect(
      page.getByText(
        'This reset link is invalid or expired. Request a new one.'
      )
    ).toBeVisible();
  });
});
