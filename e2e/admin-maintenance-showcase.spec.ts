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
import { openPasteUrl, waitForHydration } from './admin-form';

const en = copyFor('en');
const ar = copyFor('ar');

// Fixtures carry this in both names, so the run's rows are identifiable by eye
// and `deleteShowcasesByTag` can find them again without knowing their cuids.
const TAG = 'st28a';

// Stage 4c: stored media must be an https URL on the project's own Cloudinary
// cloud, so these fixtures look exactly like a real upload result. The URLs
// are served by Playwright itself (see `stubPhotos`), never by Cloudinary:
// uploads need credentials a test run has no business depending on, and the
// form's own "Or paste a URL" path feeds the identical field through the
// identical Server Action.
//
// Distinct paths so the two columns can be told apart.
const BEFORE_PHOTO = `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/${TAG}-showcase-before.png`;
const AFTER_PHOTO = `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/${TAG}-showcase-after.png`;

// A tiny, valid image: `AdminThumb` only renders its <img> after the URL has
// loaded, and a photo-less letter tile would make "the list shows both photos"
// pass without ever proving a URL was stored.
const STUB_IMAGE = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300">',
  '<rect width="400" height="300" fill="#EB693F"/>',
  '</svg>',
].join('');

async function stubPhotos(page: import('@playwright/test').Page) {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: STUB_IMAGE,
    })
  );
}

const STAMP = `${TAG}-${Date.now().toString(36)}`;
const NAME_EN = `Showcase E2E ${STAMP}`;
const NAME_AR = `ماكينة عرض ${STAMP}`;
const CATEGORY_NAME_EN = `Showcase line ${STAMP}`;

async function pastePhoto(
  page: import('@playwright/test').Page,
  which: 'before' | 'after',
  url: string
) {
  // The label points at the hidden file input, so the URL box is reached the
  // way a person reaches it: toggle it open, then type.
  const toggle =
    which === 'before'
      ? page.getByRole('button', { name: 'Paste a URL for the before photo' })
      : page.getByRole('button', { name: 'Paste a URL for the after photo' });
  await openPasteUrl(toggle, page.locator(`#showcase-${which}-url`));
  await page.locator(`#showcase-${which}-url`).fill(url);
}

test.describe('maintenance showcase CRUD', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // A production line is now required on every showcase item. It is created
  // directly in the database because the category CRUD has its own spec; this
  // one is about the machine and its photos.
  test.beforeAll(() => {
    createMaintenanceCategory({
      slug: `showcase-line-${STAMP}`,
      nameEn: CATEGORY_NAME_EN,
      nameAr: `خط عرض ${STAMP}`,
      sortOrder: 1,
    });
  });

  // Driven through the UI rather than seeded, so the assertions cover the whole
  // path: form validation, the Server Action, the audit log and the row that
  // comes back. Cleanup goes through the database rather than the delete
  // dialog, so a failed assertion cannot leave a row behind for the next run.
  test.afterAll(async () => {
    deleteShowcasesByTag(TAG);
    deleteMaintenanceCategoriesByTag(TAG);
  });

  test('create with two photos, list, edit, delete', async ({ browser }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await stubPhotos(page);

    // The section is reachable from the sidebar, not just by typing the URL.
    await page.goto(`${ADMIN_URL}/en`);
    await page.getByRole('link', { name: 'Maintenance machines' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);
    await expect(
      page.getByRole('heading', { name: 'Maintenance machines', level: 1 })
    ).toBeVisible();

    // Create. The header action is a link, not a button: `Button` renders an
    // <a> whenever it is given an href.
    await page.getByRole('link', { name: 'New machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase/new`);
    // The click can land as a full document load if the list was not hydrated
    // yet; wait for the form before the first fill, or hydration can reconcile
    // the English name back to its empty server-rendered value.
    await waitForHydration(page);
    await page.getByLabel('Machine name').fill(NAME_EN);
    await page.getByLabel('اسم الماكينة').fill(NAME_AR);
    await page.getByLabel('Category').selectOption({
      label: CATEGORY_NAME_EN,
    });
    await page
      .getByLabel('Description (English, optional)')
      .fill('E2E description of the finished job, over ten characters.');
    await pastePhoto(page, 'before', BEFORE_PHOTO);
    await pastePhoto(page, 'after', AFTER_PHOTO);
    await expect(page.getByLabel('Machine name')).toHaveValue(NAME_EN);
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);

    // In the list, with BOTH photos actually rendered as thumbnails — one per
    // column, each carrying the URL that was pasted into its own field.
    // Counted by tag, not by role: `AdminThumb` renders its loaded image as
    // `<img alt="">`, which is decorative and therefore carries no role, while
    // the letter tile it falls back to is `role="img"`. Two `<img>` tags is
    // exactly the state that proves both URLs resolved and neither half fell
    // back to a letter.
    const row = page.locator('tr', { hasText: NAME_EN });
    await expect(row).toHaveCount(1);
    await expect(row.locator('img')).toHaveCount(2);
    await expect(row.locator('img').nth(0)).toHaveAttribute(
      'src',
      BEFORE_PHOTO
    );
    await expect(row.locator('img').nth(1)).toHaveAttribute('src', AFTER_PHOTO);

    // Edit: the stored pair comes back into the form. The URL boxes start
    // closed — a stored photo shows as a preview and the text field is only
    // revealed by the same "Or paste a URL" toggle — so they are opened before
    // being read, the way an admin replacing one half would.
    await row.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/maintenance-showcase\/[^/]+\/edit$/);
    await waitForHydration(page);
    await expect(page.getByLabel('Machine name')).toHaveValue(NAME_EN);
    await expect(
      page.getByLabel('Category').locator('option:checked')
    ).toHaveText(CATEGORY_NAME_EN);
    await openPasteUrl(
      page.getByRole('button', { name: 'Paste a URL for the before photo' }),
      page.locator('#showcase-before-url')
    );
    await openPasteUrl(
      page.getByRole('button', { name: 'Paste a URL for the after photo' }),
      page.locator('#showcase-after-url')
    );
    await expect(page.locator('#showcase-before-url')).toHaveValue(
      BEFORE_PHOTO
    );
    await expect(page.locator('#showcase-after-url')).toHaveValue(AFTER_PHOTO);
    await page.getByLabel('Machine name').fill(`${NAME_EN} renamed`);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);
    await expect(page.getByText(`${NAME_EN} renamed`)).toBeVisible();

    // Renaming must not disturb the photos: the pair survives the update.
    const renamedRow = page.locator('tr', { hasText: `${NAME_EN} renamed` });
    await expect(renamedRow.locator('img')).toHaveCount(2);

    // Delete.
    await page
      .locator('tr', { hasText: `${NAME_EN} renamed` })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/maintenance-showcase\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${NAME_EN} renamed`) })
      .click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase`);
    await expect(page.locator('tr', { hasText: NAME_EN })).toHaveCount(0);

    await context.close();
  });

  test('a missing photo is refused, and nothing is saved', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await stubPhotos(page);

    await page.goto(`${ADMIN_URL}/en/maintenance-showcase/new`);
    await waitForHydration(page);
    await page.getByLabel('Machine name').fill(`${NAME_EN} no-photo`);
    await page.getByLabel('اسم الماكينة').fill(`${NAME_AR} بدون صورة`);
    await page.getByLabel('Category').selectOption({
      label: CATEGORY_NAME_EN,
    });
    // Only the before photo: the after half is what is missing.
    await pastePhoto(page, 'before', BEFORE_PHOTO);
    await page.getByRole('button', { name: 'Create machine' }).click();

    // Stayed on the form, and said which field is wrong.
    await expect(page).toHaveURL(`${ADMIN_URL}/en/maintenance-showcase/new`);
    await expect(
      page.getByText('The after photo must be an absolute http(s) URL.')
    ).toBeVisible();

    // Nothing was written, which is the half of the rule that matters.
    await page.goto(
      `${ADMIN_URL}/en/maintenance-showcase?q=${encodeURIComponent(TAG)}`
    );
    await expect(
      page.locator('tr', { hasText: `${NAME_EN} no-photo` })
    ).toHaveCount(0);

    await context.close();
  });

  test('the section is bilingual', async ({ browser }) => {
    const state = await loginState(browser, ar, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await stubPhotos(page);

    await page.goto(`${ADMIN_URL}/ar`);
    const navLink = page.getByRole('link', { name: 'ماكينات الصيانة' });
    await expect(navLink).toBeVisible();
    await navLink.click();
    await expect(page).toHaveURL(`${ADMIN_URL}/ar/maintenance-showcase`);
    await expect(
      page.getByRole('heading', { name: 'ماكينات الصيانة', level: 1 })
    ).toBeVisible();
    await expect(page.getByText('لا توجد ماكينات صيانة بعد.')).toBeVisible();

    await page.goto(`${ADMIN_URL}/ar/maintenance-showcase/new`);
    await expect(
      page.getByLabel('اسم الماكينة', { exact: true })
    ).toBeAttached();
    await expect(page.getByLabel('الفئة (الخط)')).toBeVisible();
    // `exact` because the two controls inside each upload field carry the
    // field's own wording in their aria-labels, and a substring match would
    // resolve to three elements at once.
    await expect(
      page.getByLabel('صورة قبل الصيانة', { exact: true })
    ).toBeAttached();
    await expect(
      page.getByLabel('صورة بعد الصيانة', { exact: true })
    ).toBeAttached();
    await expect(
      page.getByText('استخدم نفس الزاوية ونفس نسبة الأبعاد للصورتين')
    ).toBeVisible();

    await context.close();
  });
});
