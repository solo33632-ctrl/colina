import { test, expect, type Page } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const en = copyFor('en');

// The sidebar's own labels, kept next to the assertions rather than imported
// from the message files: the point of these tests is what the rendered page
// says, so a key renamed without its translation following would fail here.
const COPY = {
  en: {
    nav: 'Admin sections',
    groups: [
      'Overview',
      'Catalog',
      'Maintenance',
      'Content',
      'Inbox',
      'System',
    ],
    maintenance: 'Maintenance',
    links: [
      { name: 'Maintenance categories', href: '/en/maintenance-categories' },
      { name: 'Maintenance machines', href: '/en/maintenance-showcase' },
      { name: 'Maintenance services', href: '/en/services' },
    ],
    openMenu: 'Open navigation menu',
  },
  ar: {
    nav: 'أقسام لوحة التحكم',
    groups: [
      'نظرة عامة',
      'الكتالوج',
      'الصيانة',
      'المحتوى',
      'صندوق الوارد',
      'النظام',
    ],
    maintenance: 'الصيانة',
    links: [
      { name: 'تصنيفات الصيانة', href: '/ar/maintenance-categories' },
      { name: 'ماكينات الصيانة', href: '/ar/maintenance-showcase' },
      { name: 'خدمات الصيانة', href: '/ar/services' },
    ],
    openMenu: 'فتح قائمة التنقل',
  },
} as const;

type Locale = keyof typeof COPY;

// Only one nav is ever visible: the docked panel at desktop widths, the
// drawer below `lg`. `:visible` keeps the hidden copy out of the assertions.
const sidebar = (page: Page, locale: Locale) =>
  page.locator(`nav[aria-label="${COPY[locale].nav}"]:visible`);

const group = (page: Page, locale: Locale) =>
  sidebar(page, locale)
    .locator('div')
    .filter({ has: page.getByText(COPY[locale].maintenance, { exact: true }) })
    .first();

for (const locale of ['en', 'ar'] as const) {
  test(`${locale}: the maintenance entries sit together between Catalog and Content`, async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    try {
      await page.goto(`${ADMIN_URL}/${locale}/maintenance-categories`);

      const nav = sidebar(page, locale);
      await expect(nav).toBeVisible();

      // Group order is the structure, not an accident of insertion: the
      // maintenance entries sit after the product catalog and before the
      // generic content entries.
      await expect(nav.locator('p')).toHaveText([...COPY[locale].groups]);

      const maintenance = group(page, locale);
      const links = maintenance.getByRole('link');
      await expect(links).toHaveText(
        COPY[locale].links.map((link) => link.name)
      );
      for (const [index, link] of COPY[locale].links.entries()) {
        await expect(links.nth(index)).toHaveAttribute('href', link.href);
      }

      // On this route exactly one entry is current, and it is the one whose
      // section the page belongs to.
      await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(nav.locator('[aria-current="page"]')).toHaveText(
        COPY[locale].links[0].name
      );
    } finally {
      await context.close();
    }
  });
}

test('a nested maintenance-machines route highlights only Maintenance machines', async ({
  browser,
}) => {
  const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/en/maintenance-showcase/new`);

    const nav = sidebar(page, 'en');
    // The categories entry shares the `/maintenance-` text prefix; the active
    // matcher must still resolve this route to the machines entry only.
    await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
    await expect(nav.locator('[aria-current="page"]')).toHaveText(
      'Maintenance machines'
    );
    await expect(
      nav.getByRole('link', { name: 'Maintenance categories' })
    ).not.toHaveAttribute('aria-current', 'page');
  } finally {
    await context.close();
  }
});

test('the mobile drawer renders the same maintenance group', async ({
  browser,
}) => {
  const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
  const context = await browser.newContext({
    storageState: state,
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/en`);

    await page
      .getByRole('button', { name: COPY.en.openMenu, exact: true })
      .click();

    const nav = sidebar(page, 'en');
    await expect(nav).toBeVisible();
    await expect(nav.locator('p')).toHaveText([...COPY.en.groups]);

    const links = group(page, 'en').getByRole('link');
    await expect(links).toHaveText(COPY.en.links.map((link) => link.name));
  } finally {
    await context.close();
  }
});
