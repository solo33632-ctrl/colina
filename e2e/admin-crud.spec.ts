import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const en = copyFor('en');
const STAMP = `e2e-${Date.now().toString(36)}`;

// Full category CRUD through the actual UI: form fills, real submits, real
// confirmation dialog, and the has_machines block with a machine attached
// first. Runs serially with the other specs (see config).
test.describe('category CRUD flow', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // The session is memoised across the whole run (see admin-session.ts), so
  // this spec shares the sign-in the login spec already made rather than
  // spending another attempt on the login rate limit.
  test('create, verify in list, edit, block delete with machine, delete all', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    const catName = `E2E Category ${STAMP}`;
    const catSlug = `e2e-category-${STAMP}`;

    // Create.
    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await page.getByLabel('Name (English)').fill(catName);
    await page.getByLabel('Name (Arabic)').fill(`فئة ${STAMP}`);
    await page.getByLabel('Slug').fill(catSlug);
    await page
      .getByLabel('Description (English)')
      .fill('E2E description, comfortably over ten characters.');
    await page
      .getByLabel('Description (Arabic)')
      .fill('وصف تجريبي يزيد عن عشرة أحرف.');
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(page.getByText(catName)).toBeVisible();

    // Edit (rename) — scope to our row: the list is a table, so a row is a
    // <tr>; seed rows sort first.
    await page
      .locator('tr', { hasText: catName })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/categories\/[^/]+\/edit$/);
    await expect(page.getByLabel('Name (English)')).toHaveValue(catName);
    await page.getByLabel('Name (English)').fill(`${catName} Renamed`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(page.getByText(`${catName} Renamed`)).toBeVisible();

    // Attach a machine, then prove deletion is blocked.
    await page.goto(`${ADMIN_URL}/en/machines/new`);
    await page.getByLabel('Name (English)').fill(`E2E Machine ${STAMP}`);
    await page.getByLabel('Name (Arabic)').fill(`آلة ${STAMP}`);
    await page.getByLabel('Slug').fill(`e2e-machine-${STAMP}`);
    await page
      .getByLabel('Category')
      .selectOption({ label: `${catName} Renamed` });
    await page
      .getByLabel('Short description (English)')
      .fill('Short e2e description, over ten.');
    await page
      .getByLabel('Short description (Arabic)')
      .fill('وصف قصير يزيد عن عشرة.');
    await page
      .getByLabel('Full description (English)')
      .fill('Full e2e description, over ten characters.');
    await page
      .getByLabel('Full description (Arabic)')
      .fill('وصف كامل يزيد عن عشرة أحرف.');
    await page.getByLabel('Specs (English)').fill('E2E specs.');
    await page.getByLabel('Specs (Arabic)').fill('مواصفات.');
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);

    await page.goto(`${ADMIN_URL}/en/categories`);
    await page
      .locator('tr', { hasText: `${catName} Renamed` })
      .getByRole('link', { name: 'Edit' })
      .click();
    // The list itself has a delete button per row, so wait for the edit form
    // before clicking delete.
    await expect(page).toHaveURL(/\/categories\/[^/]+\/edit$/);
    // The delete button's accessible name is now "Delete <name>"; the visible
    // label is the short "Delete" with a trash icon. The confirmation is the
    // panel's own <dialog>, not a native window.confirm, so there is no
    // Playwright dialog event to accept.
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${catName}`) })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    // Blocked by the machine still attached, reported inside the dialog.
    await expect(page.getByText(/still has 1 machine/)).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Cancel' })
      .click();
    await expect(page.getByRole('dialog')).toBeHidden();

    // Delete machine, then the category goes through.
    const machineName = `E2E Machine ${STAMP}`;
    await page.goto(`${ADMIN_URL}/en/machines`);
    await page
      .locator('tr', { hasText: machineName })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await page.getByRole('button', { name: /^Delete / }).click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);

    await page.goto(`${ADMIN_URL}/en/categories`);
    await page
      .locator('tr', { hasText: `${catName} Renamed` })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/categories\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${catName}`) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(page.getByText(`${catName} Renamed`)).toBeHidden();

    await context.close();
  });
});
