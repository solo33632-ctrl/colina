import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import { deleteShowcasesByTag } from './db-fixture';

const en = copyFor('en');
const ar = copyFor('ar');

// Fixtures carry this in both names, so the run's rows are identifiable by eye
// and `deleteShowcasesByTag` can find them again without knowing their cuids.
const TAG = 'st28a';

// Two real, absolute http(s) URLs the admin server itself serves.
//
// Pasted rather than uploaded: uploading needs Cloudinary credentials that a
// test run has no business depending on, and the form's own "Or paste a URL"
// path feeds the identical field through the identical schema.
//
// Served by THIS app so the list thumbnails actually load — `AdminThumb` only
// renders an <img> after it has probed the URL, and a photo-less letter tile
// would make "the list shows both photos" pass without ever proving a URL was
// stored. Distinct paths so the two columns can be told apart.
const BEFORE_PHOTO = `${ADMIN_URL}/icon.png`;
const AFTER_PHOTO = `${ADMIN_URL}/apple-icon.png`;

const STAMP = `${TAG}-${Date.now().toString(36)}`;
const NAME_EN = `Showcase E2E ${STAMP}`;
const NAME_AR = `ماكينة عرض ${STAMP}`;

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
  await toggle.click();
  await page.locator(`#showcase-${which}-url`).fill(url);
}

test.describe('maintenance showcase CRUD', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // Driven through the UI rather than seeded, so the assertions cover the whole
  // path: form validation, the Server Action, the audit log and the row that
  // comes back. Cleanup goes through the database rather than the delete
  // dialog, so a failed assertion cannot leave a row behind for the next run.
  test.afterAll(async () => {
    deleteShowcasesByTag(TAG);
  });

  test('create with two photos, list, edit, delete', async ({ browser }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

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
    await page.getByLabel('Name (English)').fill(NAME_EN);
    await page.getByLabel('Name (Arabic)').fill(NAME_AR);
    await page
      .getByLabel('Description (English, optional)')
      .fill('E2E description of the finished job, over ten characters.');
    await pastePhoto(page, 'before', BEFORE_PHOTO);
    await pastePhoto(page, 'after', AFTER_PHOTO);
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
    await expect(page.getByLabel('Name (English)')).toHaveValue(NAME_EN);
    await page
      .getByRole('button', { name: 'Paste a URL for the before photo' })
      .click();
    await page
      .getByRole('button', { name: 'Paste a URL for the after photo' })
      .click();
    await expect(page.locator('#showcase-before-url')).toHaveValue(
      BEFORE_PHOTO
    );
    await expect(page.locator('#showcase-after-url')).toHaveValue(AFTER_PHOTO);
    await page.getByLabel('Name (English)').fill(`${NAME_EN} renamed`);
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

    await page.goto(`${ADMIN_URL}/en/maintenance-showcase/new`);
    await page.getByLabel('Name (English)').fill(`${NAME_EN} no-photo`);
    await page.getByLabel('Name (Arabic)').fill(`${NAME_AR} بدون صورة`);
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
