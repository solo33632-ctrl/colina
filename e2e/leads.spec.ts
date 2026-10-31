import { test, expect } from '@playwright/test';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ADMIN_URL,
  copyFor,
  loginState,
} from './admin-session';
import {
  createContactLeads,
  createMaintenanceLeads,
  deleteLeadsByTag,
  runInDbValue,
} from './db-fixture';

// The inbox's list/detail surfaces, driven through the real admin.
//
// Fixtures are written straight to the database (as the other admin specs do)
// because the subject here is triage, not lead capture: the public forms are
// covered by catalog.spec.ts and machine-quote.spec.ts. Every name carries
// `TAG`, and cleanup deletes by that prefix, so a failed assertion cannot
// leak rows into the next run.
const TAG = 'st28a';
const STAMP = `${TAG}-leads-${Date.now().toString(36)}`;
const SEARCH = STAMP;

const CONTACT_COUNT = 22;
const MAINTENANCE_COUNT = 2;
const QUOTE_COUNT = 2;
const TOTAL = CONTACT_COUNT + MAINTENANCE_COUNT + QUOTE_COUNT;

const QUOTE_MACHINE = 'Colina Pro 1000 (colina-pro-1000)';
const CONTACT_NAME = `${SEARCH} Contact 01`;
const CONTACT_EMAIL = 'st28a-contact-1@example.com';
const CONTACT_PHONE = '+20 100 123 4567';
const CONTACT_MESSAGE =
  'First line of the contact message.\nSecond line with <b>plain text</b>.';

// Newest first: contact 1 is the newest row, so the default page starts with
// it and the older maintenance/quote rows wait on page two.
const BASE = Date.now() - 60 * 60 * 1000;
const at = (offsetMinutes: number) =>
  new Date(BASE - offsetMinutes * 60 * 1000).toISOString();

let contactIds: string[] = [];
let quoteIds: string[] = [];

test.describe('admin leads inbox', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test.beforeAll(() => {
    if (!ADMIN_PASSWORD) {
      return;
    }

    contactIds = createContactLeads(
      Array.from({ length: CONTACT_COUNT }, (_, index) => ({
        name: `${SEARCH} Contact ${String(index + 1).padStart(2, '0')}`,
        email:
          index === 0
            ? CONTACT_EMAIL
            : `st28a-contact-${index + 1}@example.com`,
        phone: index === 0 ? CONTACT_PHONE : null,
        message:
          index === 0
            ? CONTACT_MESSAGE
            : `Contact message ${index + 1} for the inbox fixture.`,
        status: index === 0 ? ('RESOLVED' as const) : ('NEW' as const),
        createdAt: at(index),
      }))
    );

    createMaintenanceLeads(
      Array.from({ length: MAINTENANCE_COUNT }, (_, index) => ({
        name: `${SEARCH} Maintenance ${String(index + 1).padStart(2, '0')}`,
        company: `Fixture Foods ${index + 1}`,
        phone: '+20 100 765 4321',
        email: `st28a-maint-${index + 1}@example.com`,
        machineModel: 'Colina Conveyor Line',
        message: 'The line stops at startup.\nPlease advise.',
        status: index === 0 ? ('IN_PROGRESS' as const) : ('NEW' as const),
        createdAt: at(30 + index),
      }))
    );

    quoteIds = createMaintenanceLeads(
      Array.from({ length: QUOTE_COUNT }, (_, index) => ({
        name: `${SEARCH} Quote ${String(index + 1).padStart(2, '0')}`,
        company: null,
        phone: '+20 100 765 4322',
        email: `st28a-quote-${index + 1}@example.com`,
        machineModel: QUOTE_MACHINE,
        message: 'We need a quote for a 1000 unit per hour line.',
        createdAt: at(40 + index),
      }))
    );
  });

  test.afterAll(() => {
    if (!ADMIN_PASSWORD) {
      return;
    }
    deleteLeadsByTag(TAG);
    const leftovers = runInDbValue<{ contacts: number; requests: number }>(`
      const contacts = await prisma.contactMessage.count({
        where: { name: { contains: ${JSON.stringify(TAG)} } },
      });
      const requests = await prisma.maintenanceRequest.count({
        where: { name: { contains: ${JSON.stringify(TAG)} } },
      });
      return { contacts, requests };
    `);
    expect(leftovers).toEqual({ contacts: 0, requests: 0 });
  });

  test('list tabs, search, pagination and a contact detail', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/leads`);
    await expect(
      page.getByRole('heading', { name: 'Leads', level: 1 })
    ).toBeVisible();
    await expect(page.getByText(/Total requests: \d+/)).toBeVisible();

    const tabs = page.getByRole('navigation', { name: 'Filter by type' });
    for (const label of ['All', 'Contact', 'Maintenance', 'Quotes']) {
      await expect(
        tabs.getByRole('link', { name: new RegExp(`^${label}`) })
      ).toBeVisible();
    }

    // Search narrows both tables to exactly this run's rows.
    await page.getByLabel('Search requests').fill(SEARCH);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page).toHaveURL((url) => url.searchParams.get('q') === SEARCH);

    await expect(page.getByText('Total requests: 26')).toBeVisible();
    await expect(tabs.getByRole('link', { name: /^All/ })).toContainText(
      String(TOTAL)
    );
    await expect(tabs.getByRole('link', { name: /^Contact/ })).toContainText(
      String(CONTACT_COUNT)
    );
    await expect(
      tabs.getByRole('link', { name: /^Maintenance/ })
    ).toContainText(String(MAINTENANCE_COUNT));
    await expect(tabs.getByRole('link', { name: /^Quotes/ })).toContainText(
      String(QUOTE_COUNT)
    );

    // Twenty rows on page one, the remaining six on page two.
    await expect(page.locator('main tbody tr')).toHaveCount(20);
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await page.getByRole('link', { name: 'Next' }).click();
    await expect(page.getByText('Page 2 of 2')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(TOTAL - 20);

    // Type tabs filter the merged list and reset pagination.
    await tabs.getByRole('link', { name: /^Quotes/ }).click();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get('type') === 'quote'
    );
    await expect(page.locator('main tbody tr')).toHaveCount(QUOTE_COUNT);
    for (const row of await page.locator('main tbody tr').all()) {
      await expect(row).toContainText('Quote request');
      await expect(row).toContainText(QUOTE_MACHINE);
    }

    await tabs.getByRole('link', { name: /^Maintenance/ }).click();
    await expect(page.locator('main tbody tr')).toHaveCount(MAINTENANCE_COUNT);
    await expect(page.getByText('Page 1 of 1')).toBeHidden();

    await tabs.getByRole('link', { name: /^Contact/ }).click();
    await expect(page.getByText('Page 1 of 2')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(20);

    // A search with no matches gets the filter-specific empty state and a
    // one-click way back to the whole inbox.
    await page.getByLabel('Search requests').fill(`${STAMP}-no-such-lead`);
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    await expect(page.getByText('No results for your filters')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(0);
    await page.getByRole('link', { name: 'Clear filters' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/leads`);

    // The contact detail shows every stored field, the status control and
    // one-tap actions. The message is a text node: HTML in it is never parsed.
    await page.goto(`${ADMIN_URL}/en/leads/contact/${contactIds[0]}`);
    await expect(
      page.getByRole('heading', { name: CONTACT_NAME, level: 1 })
    ).toBeVisible();
    await expect(page.getByText('Contact', { exact: true })).toBeVisible();
    await expect(
      page.locator('header').getByText('Resolved', { exact: true })
    ).toBeVisible();
    await expect(page.getByText(CONTACT_EMAIL, { exact: true })).toBeVisible();
    await expect(page.getByText(CONTACT_PHONE, { exact: true })).toBeVisible();

    const message = page.locator('main p.whitespace-pre-line');
    await expect(message).toHaveCSS('white-space', 'pre-line');
    await expect(message).toContainText('<b>plain text</b>');
    expect(await message.textContent()).toContain('\n');
    await expect(page.locator('main b')).toHaveCount(0);

    await expect(page.getByRole('link', { name: 'WhatsApp' })).toHaveAttribute(
      'href',
      'https://wa.me/201001234567'
    );
    await expect(page.getByRole('link', { name: 'Call' })).toHaveAttribute(
      'href',
      'tel:+201001234567'
    );
    await expect(page.getByRole('link', { name: 'Email' })).toHaveAttribute(
      'href',
      `mailto:${CONTACT_EMAIL}`
    );
    await expect(page.getByLabel('Status')).toHaveValue('RESOLVED');
    await expect(
      page.getByRole('button', { name: 'Update status' })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'Back to leads' })
    ).toBeVisible();

    await context.close();
  });

  test('a quote request keeps its quote badge and machine', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/leads/maintenance/${quoteIds[0]}`);
    await expect(
      page.getByRole('heading', {
        name: `${SEARCH} Quote 01`,
        level: 1,
      })
    ).toBeVisible();
    await expect(
      page.getByText('Quote request', { exact: true })
    ).toBeVisible();
    await expect(page.getByText('Machine / model')).toBeVisible();
    await expect(page.getByText(QUOTE_MACHINE, { exact: true })).toBeVisible();
    await expect(page.getByLabel('Status')).toHaveValue('NEW');

    await page.getByRole('link', { name: 'Back to leads' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/leads`);

    await context.close();
  });

  test('list and detail are translated and mirrored in Arabic', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      copyFor('ar'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/ar/leads?q=${encodeURIComponent(SEARCH)}`);
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(
      page.getByRole('heading', { name: 'الطلبات', level: 1 })
    ).toBeVisible();
    await expect(page.getByText(/إجمالي الطلبات/)).toBeVisible();

    const tabs = page.getByRole('navigation', {
      name: 'التصفية حسب النوع',
    });
    for (const label of ['الكل', 'تواصل', 'صيانة', 'عروض أسعار']) {
      await expect(
        tabs.getByRole('link', { name: new RegExp(`^${label}`) })
      ).toBeVisible();
    }
    await expect(page.getByText('الصفحة 1 من 2')).toBeVisible();
    await expect(page.locator('main tbody tr')).toHaveCount(20);

    await page.goto(`${ADMIN_URL}/ar/leads/contact/${contactIds[0]}`);
    await expect(
      page.getByRole('heading', { name: CONTACT_NAME, level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'العودة إلى الطلبات' })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'تفاصيل', level: 2 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'الرسالة', level: 2 })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: 'واتساب' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'اتصال' })).toBeVisible();
    await expect(
      page.getByRole('link', { name: 'بريد إلكتروني' })
    ).toBeVisible();

    await context.close();
  });

  test('list and detail do not overflow at 390px', async ({ browser }) => {
    const state = await loginState(
      browser,
      copyFor('en'),
      ADMIN_EMAIL,
      ADMIN_PASSWORD
    );
    const context = await browser.newContext({
      storageState: state,
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/leads?q=${encodeURIComponent(SEARCH)}`);
    // Phones get cards; the table stays in the DOM but out of the layout.
    await expect(page.locator('main ul[aria-label="Leads"] li')).toHaveCount(
      20
    );
    await expect(page.locator('main table')).toBeHidden();

    const listWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(listWidth.document).toBeLessThanOrEqual(listWidth.viewport + 1);
    expect(listWidth.body).toBeLessThanOrEqual(listWidth.viewport + 1);

    await page.goto(`${ADMIN_URL}/en/leads/contact/${contactIds[0]}`);
    await expect(
      page.getByRole('heading', { name: CONTACT_NAME, level: 1 })
    ).toBeVisible();
    const detailWidth = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(detailWidth.document).toBeLessThanOrEqual(detailWidth.viewport + 1);
    expect(detailWidth.body).toBeLessThanOrEqual(detailWidth.viewport + 1);

    await context.close();
  });
});
