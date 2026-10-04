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

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The dashboard reads two tables nothing else in the suite writes to, so this
// spec creates its own rows through the app rather than reaching into the
// database for them: the public site's own beacon records the page views, and
// the contact endpoint's honeypot records the security events. Both paths are
// the real ones, so the test fails if either writer breaks.
//
// The honeypot is checked before the rate limiter, so these posts do not spend
// the contact endpoint's budget or the admin login budget.
async function seedTrafficAndEvents(page: import('@playwright/test').Page) {
  // One page view each: the beacon is a client effect, so the page has to
  // hydrate before it fires (see e2e/page-views.spec.ts for the same rule).
  for (const path of ['/en', '/en/privacy']) {
    await page.goto(`${WEB_URL}${path}`);
    await page.waitForTimeout(1200);
  }

  const response = await page.request.post(`${WEB_URL}/api/contact`, {
    headers: { origin: WEB_URL },
    data: {
      name: 'Insights Fixture',
      email: 'fixture@example.com',
      phone: '+201000000000',
      message: 'A message long enough to pass validation, never stored.',
      // The hidden field: a filled trap means a bot, and the endpoint records
      // HONEYPOT_CAUGHT instead of the message.
      website: 'spam-fixture',
    },
  });
  expect(
    response.status(),
    'honeypot POST is accepted as if from a person'
  ).toBe(200);
}

test.describe('insights dashboard', () => {
  // A session cookie is not locale-scoped, so each role signs in once and is
  // then exercised under both locale prefixes, rather than spending the login
  // rate limit (10 attempts per 15 minutes) on the suite itself.
  const en = copyFor('en');

  test('a super admin sees the traffic and security data, and the range switch changes it', async ({
    browser,
  }) => {
    // A throwaway context for the public site, so seeding traffic does not
    // depend on any session the admin specs hold.
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await seedTrafficAndEvents(publicPage);
    await publicContext.close();

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      // Default is 7 days; the URL is explicit so the two passes cannot leak
      // state into each other.
      await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);
      await expect(page.locator('h1')).toBeVisible();

      const bars = page.locator('main svg rect');
      await expect(bars).toHaveCount(7);

      // The headline count is non-zero, and the page the seeded visit was
      // recorded for is in the top-pages table.
      const totalViews = Number(
        (await page.getByTestId('insights-total-views').innerText()).replace(
          /[^\d]/g,
          ''
        )
      );
      expect(
        totalViews,
        `${locale.id}: seeded page views are counted`
      ).toBeGreaterThan(0);

      const topPages = page.locator('main table').first();
      await expect(topPages.getByText('/privacy')).toBeVisible();

      // The seeded honeypot post is in the table, under its translated label.
      const events = page.locator('main table').nth(1);
      await expect(events.locator('tbody tr').first()).toBeVisible();
      await expect(
        events
          .getByText(locale.id === 'ar' ? 'ضبط حقل الفخ' : 'Honeypot caught')
          .first()
      ).toBeVisible();

      // The switch is a real state change: 30 bars instead of 7, and a
      // different URL to carry it.
      const longLabel = locale.id === 'ar' ? 'آخر ٣٠ يوماً' : 'Last 30 days';
      await page.getByRole('button', { name: longLabel }).click();
      await page.waitForURL(new RegExp(`/${locale.id}/insights\\?range=30`));
      await expect(bars).toHaveCount(30);
    }

    await context.close();
  });

  test('an editor is refused and never sees the link', async ({ browser }) => {
    test.skip(!DATABASE_URL, 'DATABASE_URL is required to create the editor');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
    ensureEditor();
    try {
      const state = await loginState(
        browser,
        en,
        EDITOR.email,
        EDITOR.password
      );
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();

      for (const locale of LOCALES) {
        // Hidden in the nav...
        await page.goto(`${ADMIN_URL}/${locale.id}`);
        const nav = await page.locator('aside nav').first().textContent();
        const label = locale.id === 'ar' ? 'رؤى' : 'Insights';
        expect(
          nav,
          `/${locale.id}: insights link hidden for an editor`
        ).not.toContain(label);

        // ...and a direct request gets the explanatory card, not the data.
        const res = await page.goto(`${ADMIN_URL}/${locale.id}/insights`);
        expect(res?.status(), `/${locale.id}/insights`).toBe(200);
        await expect(page.getByText(locale.denied)).toBeVisible();
        // Nothing from either table leaked into the refusal.
        await expect(page.getByText(locale.audit)).toHaveCount(0);
      }

      await context.close();
    } finally {
      removeEditor();
    }
  });
});
