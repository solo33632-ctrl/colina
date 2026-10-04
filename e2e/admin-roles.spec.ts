import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  LOCALES,
  copyFor,
  loginState,
} from './admin-session';

import {
  DATABASE_URL,
  EDITOR,
  ensureEditor,
  removeEditor,
} from './admin-editor';

// The audit log is a role gate (Phase 12): editors must be refused, and the
// refusal has to hold under both locale prefixes because the gate lives
// inside a `[locale]` segment. The insights dashboard is a second gate
// (Phase 21c) with its own spec; both share the fixture in admin-editor.ts.

test.describe('admin role gating', () => {
  test.beforeAll(() => {
    test.skip(!DATABASE_URL, 'DATABASE_URL is required to create the editor');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
    ensureEditor();
  });

  test.afterAll(() => {
    if (DATABASE_URL) {
      removeEditor();
    }
  });

  // A session cookie is not locale-scoped, so each role is signed in once
  // and the same session is then exercised under both locale prefixes. The
  // gate under test is the role check inside the page, not the login locale —
  // signing in per locale would only spend the login rate limit (10 attempts
  // per 15 minutes per IP) on the suite itself.
  const en = copyFor('en');

  test('the audit-log role gate holds under both locales', async ({
    browser,
  }) => {
    const editorState = await loginState(
      browser,
      en,
      EDITOR.email,
      EDITOR.password
    );
    const editorContext = await browser.newContext({
      storageState: editorState,
    });
    const editorPage = await editorContext.newPage();

    for (const locale of LOCALES) {
      // The nav link is hidden for an editor...
      await editorPage.goto(`${ADMIN_URL}/${locale.id}`);
      expect(
        await editorPage.locator('aside nav').first().textContent(),
        `/${locale.id}: audit link should be hidden for an editor`
      ).not.toContain(locale.audit);

      // ...and a direct request is refused with the explanatory card rather
      // than a bare 403 (the behaviour Phase 12 established).
      const res = await editorPage.goto(`${ADMIN_URL}/${locale.id}/audit-log`);
      expect(res?.status(), `/${locale.id}/audit-log`).toBe(200);
      await expect(editorPage.getByText(locale.denied)).toBeVisible();

      // An editor keeps full access to the content sections.
      await editorPage.goto(`${ADMIN_URL}/${locale.id}/categories`);
      await expect(editorPage.locator('h1')).toBeVisible();
    }
    await editorContext.close();
  });

  test('a super admin reaches the audit log under both locales', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      await page.goto(`${ADMIN_URL}/${locale.id}`);
      expect(
        await page.locator('aside nav').first().textContent(),
        `/${locale.id}: audit link should be visible for a super admin`
      ).toContain(locale.audit);

      await page.goto(`${ADMIN_URL}/${locale.id}/audit-log`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByText(locale.denied)).toHaveCount(0);
    }
    await context.close();
  });
});
