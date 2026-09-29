import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const en = copyFor('en');

// The admin-curated "featured" flag, driven through the real form. Covers the
// admin half only: the home page lives in a separate app with its own ISR
// cache, so asserting a cross-app refresh here would assert the deployment
// topology rather than this feature (see apps/admin/lib/revalidate-web.ts).
test.describe('machine featured flag', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test('the toggle round-trips and the list badge follows it', async ({
    browser,
  }) => {
    // The session is memoised across the run (see admin-session.ts), so this
    // shares the sign-in rather than spending another login attempt.
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    // A machine of our own, so the run leaves the seeded catalogue as it found
    // it. Created with no images, which the URL rules accept.
    const stamp = `feat-${Date.now().toString(36)}`;
    const name = `Featured E2E ${stamp}`;

    await page.goto(`${ADMIN_URL}/en/machines/new`);
    await page.getByLabel('Name (English)').fill(name);
    await page.getByLabel('Name (Arabic)').fill(`آلة مميزة ${stamp}`);
    await page.getByLabel('Slug').fill(stamp);
    await page.getByLabel('Category').selectOption({ index: 1 });
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

    // The cap is stated before the box is touched, and a new machine starts
    // unfeatured.
    const box = page.getByLabel('Featured on homepage');
    await expect(box).not.toBeChecked();
    await expect(
      page.getByText(
        /currently featured\. The homepage shows the 6 most recently saved/
      )
    ).toBeVisible();

    await box.check();
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);

    // The list marks it, so the current selection is legible without opening
    // each machine.
    const row = page.locator('tr', { hasText: name });
    await expect(row.getByText('Featured', { exact: true })).toBeVisible();

    // Reopening shows the stored value, not the create default.
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await expect(page.getByLabel('Featured on homepage')).toBeChecked();

    // Un-checking persists and the badge disappears.
    await page.getByLabel('Featured on homepage').uncheck();
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(
      page
        .locator('tr', { hasText: name })
        .getByText('Featured', { exact: true })
    ).toHaveCount(0);

    // Clean up, so the catalogue is unchanged.
    await page.goto(`${ADMIN_URL}/en/machines?q=${stamp}`);
    await page
      .locator('tr', { hasText: name })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${name}`) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(page.locator('tr', { hasText: name })).toHaveCount(0);

    await context.close();
  });

  test('the hint reads as a sentence in both locales', async ({ browser }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    // Whichever machine is opened, the count must pluralise: "1 machine is",
    // never "1 machines are".
    for (const [locale, rowName, pattern] of [
      ['en', 'Colina Pro 2000', /^\d+ machines? (is|are) currently featured\./],
      ['ar', 'كولينا برو 2000', /مميزة حاليًا\./],
    ] as const) {
      const editLabel = locale === 'en' ? 'Edit' : 'تعديل';
      await page.goto(
        `${ADMIN_URL}/${locale}/machines?q=${encodeURIComponent(rowName)}`
      );
      await page
        .locator('tr', { hasText: rowName })
        .getByRole('link', { name: editLabel })
        .click();
      await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
      await expect(page.locator('p', { hasText: pattern })).toBeVisible();
    }

    await context.close();
  });
});
