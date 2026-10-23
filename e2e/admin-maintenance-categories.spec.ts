import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import {
  createMaintenanceCategory,
  deleteMaintenanceCategoriesByTag,
  deleteShowcasesByTag,
} from './db-fixture';

const en = copyFor('en');

// Fixtures carry this in every slug/name, so the run's rows are identifiable
// by eye and the afterAll cleanup can find them without knowing their cuids.
const TAG = 'st28a';
const STAMP = `${TAG}-${Date.now().toString(36)}`;

const CATEGORY_NAME_EN = `Maintenance Line ${STAMP}`;
const CATEGORY_NAME_AR = `خط صيانة ${STAMP}`;
const CATEGORY_SLUG = `maintenance-line-${STAMP}`;
const OTHER_CATEGORY_NAME_EN = `Other Line ${STAMP}`;
const MACHINE_NAME_EN = `Machine ${STAMP}`;
const MACHINE_NAME_AR = `ماكينة ${STAMP}`;

const COVER_PHOTO = `${ADMIN_URL}/icon.png`;
const BEFORE_PHOTO = `${ADMIN_URL}/icon.png`;
const AFTER_PHOTO = `${ADMIN_URL}/apple-icon.png`;

async function pastePhoto(
  page: import('@playwright/test').Page,
  which: 'before' | 'after',
  url: string
) {
  const toggle =
    which === 'before'
      ? page.getByRole('button', { name: 'Paste a URL for the before photo' })
      : page.getByRole('button', { name: 'Paste a URL for the after photo' });
  await toggle.click();
  await page.locator(`#showcase-${which}-url`).fill(url);
}

test.describe('maintenance categories and showcase assignment', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // A second line, created directly in the database: the filter assertions
  // need a category that is definitely NOT the one the machine belongs to.
  test.beforeAll(() => {
    createMaintenanceCategory({
      slug: `other-line-${STAMP}`,
      nameEn: OTHER_CATEGORY_NAME_EN,
      nameAr: `خط آخر ${STAMP}`,
      sortOrder: 2,
    });
  });

  // Cleanup goes through the database rather than the delete dialog, so a
  // failed assertion cannot leave rows behind for the next run. Showcase items
  // go first: MaintenanceShowcase.categoryId is ON DELETE RESTRICT.
  test.afterAll(() => {
    deleteShowcasesByTag(TAG);
    deleteMaintenanceCategoriesByTag(TAG);
  });

  test('category CRUD, required assignment, blocked delete, filter', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    // The section is reachable from the sidebar, not just by typing the URL.
    await page.goto(`${ADMIN_URL}/en`);
    await page.getByRole('link', { name: 'Maintenance categories' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories`);
    await expect(
      page.getByRole('heading', { name: 'Maintenance categories', level: 1 })
    ).toBeVisible();

    // Create, including the optional cover photo and an explicit display order.
    await page.getByRole('link', { name: 'New category' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories/new`);
    await page.getByLabel('Name').fill(CATEGORY_NAME_EN);
    await page.getByLabel('الاسم').fill(CATEGORY_NAME_AR);
    await page.getByLabel('Slug').fill(CATEGORY_SLUG);
    await page.getByRole('button', { name: 'Or paste a URL' }).click();
    await page.locator('#maintenance-category-image-url').fill(COVER_PHOTO);
    await page.getByLabel('Display order').fill('5');
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories`);

    // In the list: name, slug, count, cover thumbnail and display order.
    const row = page.locator('tr', { hasText: CATEGORY_NAME_EN });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(CATEGORY_SLUG);
    await expect(row).toContainText('0 machines');
    await expect(row).toContainText('5');
    await expect(row.locator('img')).toHaveCount(1);
    await expect(row.locator('img')).toHaveAttribute('src', COVER_PHOTO);

    // Edit: the stored values come back, then change the name and the order.
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/maintenance-categories\/[^/]+\/edit$/);
    await expect(page.getByLabel('Name')).toHaveValue(CATEGORY_NAME_EN);
    await expect(page.getByLabel('Slug')).toHaveValue(CATEGORY_SLUG);
    await expect(page.getByLabel('Display order')).toHaveValue('5');
    await page.getByRole('button', { name: 'Or paste a URL' }).click();
    await expect(page.locator('#maintenance-category-image-url')).toHaveValue(
      COVER_PHOTO
    );
    await page.getByLabel('Name').fill(`${CATEGORY_NAME_EN} Renamed`);
    await page.getByLabel('Display order').fill('2');
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories`);
    await expect(page.getByText(`${CATEGORY_NAME_EN} Renamed`)).toBeVisible();

    // The showcase form refuses to save without a category...
    await page.goto(`${ADMIN_URL}/en/maintenance-showcase/new`);
    await page.getByLabel('Machine name').fill(MACHINE_NAME_EN);
    await page.getByLabel('اسم الماكينة').fill(MACHINE_NAME_AR);
    await pastePhoto(page, 'before', BEFORE_PHOTO);
    await pastePhoto(page, 'after', AFTER_PHOTO);
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase/new`);
    await expect(page.getByText('Choose a category.')).toBeVisible();

    // ...and saves once one is chosen.
    await page
      .getByLabel('Category')
      .selectOption({ label: `${CATEGORY_NAME_EN} Renamed` });
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);
    const machineRow = page.locator('tr', { hasText: MACHINE_NAME_EN });
    await expect(machineRow).toHaveCount(1);
    await expect(machineRow).toContainText(`${CATEGORY_NAME_EN} Renamed`);

    // The category filter narrows the showcase list: our line shows the
    // machine, the other line does not.
    await page.locator('#showcase-category-filter').selectOption({
      label: `${CATEGORY_NAME_EN} Renamed`,
    });
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page).toHaveURL(/[?&]category=/);
    await expect(page.locator('tr', { hasText: MACHINE_NAME_EN })).toHaveCount(
      1
    );

    await page.locator('#showcase-category-filter').selectOption({
      label: OTHER_CATEGORY_NAME_EN,
    });
    await page.getByRole('button', { name: 'Search' }).click();
    await expect(page.locator('tr', { hasText: MACHINE_NAME_EN })).toHaveCount(
      0
    );

    // Deleting the category is blocked while the machine still points at it.
    await page.goto(`${ADMIN_URL}/en/maintenance-categories`);
    await page
      .locator('tr', { hasText: `${CATEGORY_NAME_EN} Renamed` })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/maintenance-categories\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: `Delete ${CATEGORY_NAME_EN} Renamed` })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page.getByText(/still has 1 machine/)).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Delete the machine, then the category goes through.
    await page.goto(`${ADMIN_URL}/en/maintenance-showcase`);
    await page
      .locator('tr', { hasText: MACHINE_NAME_EN })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/maintenance-showcase\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${MACHINE_NAME_EN}`) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);

    await page.goto(`${ADMIN_URL}/en/maintenance-categories`);
    await page
      .locator('tr', { hasText: `${CATEGORY_NAME_EN} Renamed` })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/maintenance-categories\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: `Delete ${CATEGORY_NAME_EN} Renamed` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-categories`);
    await expect(page.getByText(`${CATEGORY_NAME_EN} Renamed`)).toBeHidden();

    await context.close();
  });
});
