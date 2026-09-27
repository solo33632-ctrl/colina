import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_PASSWORD,
  ADMIN_EMAIL,
  LOCALES,
  copyFor,
  loginState,
} from './admin-session';

test.describe('admin login', () => {
  test("an unauthenticated page request redirects to that locale's login", async ({
    page,
  }) => {
    // proxy.ts composes locale prefixing with the session gate. This is the
    // assertion that the redirect target follows the locale, including the
    // callbackUrl that returns the visitor to where they were headed.
    for (const locale of LOCALES) {
      await page.goto(`${ADMIN_URL}/${locale.id}/categories`);
      await expect(page).toHaveURL(
        `${ADMIN_URL}/${locale.id}/login?callbackUrl=%2F${locale.id}%2Fcategories`
      );
      await expect(
        page.getByRole('button', { name: locale.submit })
      ).toBeVisible();
    }
  });

  for (const locale of LOCALES) {
    test.describe(`/${locale.id}`, () => {
      test('invalid credentials stay on /login with a generic error', async ({
        page,
      }) => {
        await page.goto(`${ADMIN_URL}/${locale.id}/login`);
        await page.getByLabel(locale.email).fill('admin@example.com');
        await page
          .getByLabel(locale.password)
          .fill('definitely-wrong-password');
        await page.getByRole('button', { name: locale.submit }).click();
        await expect(page.getByText(locale.invalid)).toBeVisible();
        await expect(page).toHaveURL(new RegExp(`/${locale.id}/login$`));
      });

      test("valid credentials reach this locale's dashboard", async ({
        browser,
      }) => {
        test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
        // Sign in once through the form and hand back the session, so the
        // login rate limit (10 per 15 min per IP) is not spent per test.
        const state = await loginState(
          browser,
          locale,
          ADMIN_EMAIL,
          ADMIN_PASSWORD
        );
        const context = await browser.newContext({ storageState: state });
        const page = await context.newPage();
        await page.goto(`${ADMIN_URL}/${locale.id}`);
        await expect(
          page.getByRole('heading', { name: locale.brand })
        ).toBeVisible();
        await expect(page).toHaveURL(`${ADMIN_URL}/${locale.id}`);
        await context.close();
      });

      test('the document direction and robots meta follow the locale', async ({
        page,
      }) => {
        await page.goto(`${ADMIN_URL}/${locale.id}/login`);
        const html = page.locator('html');
        await expect(html).toHaveAttribute(
          'dir',
          locale.id === 'ar' ? 'rtl' : 'ltr'
        );
        await expect(html).toHaveAttribute('lang', locale.id);
        // agent.md: the admin must never be crawlable.
        await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
          'content',
          /noindex/
        );
      });
    });
  }

  test('the NextAuth API is reachable without a locale prefix or a session', async ({
    request,
  }) => {
    // proxy.ts excludes /api/auth from both the locale middleware and the
    // session gate; if the matcher regressed, sign-in would break entirely.
    for (const path of [
      '/api/auth/providers',
      '/api/auth/session',
      '/api/auth/csrf',
    ]) {
      const res = await request.get(`${ADMIN_URL}${path}`);
      expect(res.status(), `${path} should be reachable`).toBe(200);
    }
  });

  test('an unprefixed request is negotiated into a locale', async ({
    page,
  }) => {
    // next-intl's priority is prefix -> cookie -> accept-language ->
    // defaultLocale, so this lands on whichever locale the browser asks for
    // rather than always the default. Either outcome is correct; what matters
    // is that the request is never served unprefixed.
    await page.goto(`${ADMIN_URL}/login`);
    await expect(page).toHaveURL(new RegExp(`/(ar|en)/login$`));
    await expect(page.locator('html')).toHaveAttribute('lang', /^(ar|en)$/);
  });

  test('the language switcher keeps the visitor on the same section', async ({
    browser,
  }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
    const en = copyFor('en');
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/machines`);
    await page.locator('header .ms-auto button').first().click();
    await page.waitForURL(/\/ar\/machines$/, { timeout: 15_000 });
    // Same section, other language.
    expect(new URL(page.url()).pathname).toBe('/ar/machines');
    await context.close();
  });
});
