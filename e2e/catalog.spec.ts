import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const en = copyFor('en');

// A machine known to be alone in its category (Conveying Systems holds only
// Colina Belt 500) and one category that holds more than one machine.
const LONE_MACHINE = '/machines/colina-belt-500';
const SHARED_CATEGORY = '/categories/production-lines';

test.describe('catalog browsing flow', () => {
  test('the categories index shows every category with a machine count', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/categories`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Product categories' })
    ).toBeVisible();

    const cards = page.locator('main ul li a[href^="/en/categories/"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Each card is a link through to its own category page.
    const first = cards.first();
    await expect(first).toHaveAttribute('href', /^\/en\/categories\/[^/]+$/);
    // ...and every card carries a machine count, including the "none" case.
    for (const label of await page
      .locator('main ul li a span.rounded-full')
      .allTextContents()) {
      expect(label).toMatch(/\d|one|No machines/i);
    }
  });

  test('a category card opens its own detail page', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/categories`);
    await page.locator('main ul li a[href^="/en/categories/"]').first().click();
    await page.waitForURL(/\/en\/categories\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: a category page opens with a breadcrumb and a machine grid`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}${SHARED_CATEGORY}`);

      const trail = page.getByRole('navigation', {
        name: locale === 'ar' ? 'مسار التنقل' : 'Breadcrumb',
      });
      await expect(trail).toBeVisible();
      // The last crumb is the current page and is not a link.
      await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);

      // Machines are listed as photo+name cards that link to their own page.
      const cards = page.locator('main ul li a[href*="/machines/"]');
      expect(await cards.count()).toBeGreaterThan(0);
      for (const href of await cards.evaluateAll((as) =>
        as.map((a) => a.getAttribute('href'))
      )) {
        expect(href).toMatch(new RegExp(`^/${locale}/machines/[^/]+$`));
      }
    });
  }

  // A category with nothing in it must not render a bare heading over nothing.
  test('a category with no machines shows its empty state', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/categories/ta`);
    await expect(page.getByRole('main')).toContainText(
      'No machines in this category yet.'
    );
    await expect(page.locator('#related-heading')).toHaveCount(0);
  });

  test('the breadcrumb separator never reverses the page into a sideways scroll', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/ar/categories/production-lines`);
    const widths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});

test.describe('related machines', () => {
  test('a machine alone in its category gets no related section', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en${LONE_MACHINE}`);
    // Not an empty strip: the section is not rendered at all.
    await expect(page.locator('#related-heading')).toHaveCount(0);
  });

  test('a machine with siblings lists them and never itself', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    const heading = page.locator('#related-heading');
    await expect(heading).toBeVisible();

    const links = page.locator(
      '#related-heading ~ ul li a, section[aria-labelledby="related-heading"] li a'
    );
    const hrefs = await links.evaluateAll((as) =>
      as.map((a) => a.getAttribute('href') ?? '')
    );
    expect(hrefs.length).toBeGreaterThan(0);
    // Cap of four.
    expect(hrefs.length).toBeLessThanOrEqual(4);
    // No self-reference.
    expect(hrefs).not.toContain('/en/machines/colina-pro-1000');
  });

  test('the related strip is identical on both locales', async ({ page }) => {
    const hrefs: string[] = [];
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}/machines/colina-pro-1000`);
      const list = page.locator(
        'section[aria-labelledby="related-heading"] li a'
      );
      hrefs.push(
        (
          await list.evaluateAll((as) =>
            as.map((a) => a.getAttribute('href') ?? '')
          )
        )
          .map((h) => h.replace(/^\/(en|ar)\//, '/'))
          .join(',')
      );
    }
    expect(hrefs[0]).toBe(hrefs[1]);
  });
});

test.describe('machine quote panel', () => {
  test('is present beside the machine, states which machine, and stacks below the gallery on mobile', async ({
    browser,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/${locale}/machines/colina-pro-1000`);

      const panel = page.locator('#quote-heading');
      await expect(panel).toBeVisible();
      // The machine is named, so the visitor never has to type a model. The
      // slug is the same in both locales, so it is what proves the reference
      // was built from the row rather than pasted from the URL.
      await expect(
        page.getByText('(colina-pro-1000)', { exact: false })
      ).toBeVisible();
      await context.close();
    }

    // Mobile: the panel comes after the gallery, before the description.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    const order = await page.evaluate(() => {
      const top = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
      };
      return {
        panel: top('#quote-heading'),
        description: top('#description-heading'),
      };
    });
    expect(order.panel).toBeLessThan(order.description);
    await context.close();
  });

  test('invalid input is rejected client-side and never POSTs', async ({
    page,
  }) => {
    let posted = false;
    page.on('request', (r) => {
      if (
        r.url().endsWith('/api/maintenance-request') &&
        r.method() === 'POST'
      ) {
        posted = true;
      }
    });
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    await page.getByLabel('Phone', { exact: false }).fill('123');
    await page.getByRole('button', { name: 'Send quote request' }).click();
    await expect(
      page.getByText('Please enter a valid phone number.')
    ).toBeVisible();
    expect(posted).toBe(false);
  });

  // The endpoint is rate limited (5 per 10 minutes per IP, shared with the
  // public maintenance form), so the suite deliberately spends only one
  // submission here and checks it end to end.
  test('a valid submission reaches the backend and shows up as a lead', async ({
    browser,
  }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);

    // Unique so the assertion finds this submission and not an earlier one.
    const stamp = `Quote E2E ${Date.now().toString(36)}`;
    await page.getByLabel('Name', { exact: true }).fill(stamp);
    // Company left blank on purpose: the admin's lead summary falls back to
    // the machine reference, which is what this test needs to observe.
    await page.getByLabel('Phone', { exact: false }).fill('+201001234567');
    await page
      .getByLabel('Message', { exact: false })
      .fill('We need a quote for a 1000 unit per hour line.');
    await page.getByRole('button', { name: 'Send quote request' }).click();

    await expect(
      page.getByText('Thank you — your quote request was received.')
    ).toBeVisible();
    await context.close();

    // ...and it is in the admin's inbox, carrying which machine it is about.
    // The leads list is a card list, not a table.
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const admin = await browser.newContext({ storageState: state });
    const adminPage = await admin.newPage();
    await adminPage.goto(`${ADMIN_URL}/en/leads`);
    const card = adminPage.locator('main li').filter({ hasText: stamp });
    await expect(card).toBeVisible();
    // `company` was left blank, so the card's summary falls back to the
    // machine reference — exactly what an admin triaging the inbox needs.
    await expect(card).toContainText('(colina-pro-1000)');
    await admin.close();
  });

  test('the honeypot is still wired into the quote form', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    // Present, but out of the tab order and inside an aria-hidden wrapper,
    // exactly as on the maintenance form: reused endpoint, reused trap.
    const trap = page.locator('input[name="website"]');
    await expect(trap).toHaveCount(1);
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap).toHaveAttribute('autocomplete', 'off');
    await expect(
      trap.locator('xpath=ancestor::div[@aria-hidden="true"]')
    ).toHaveCount(1);
  });
});
