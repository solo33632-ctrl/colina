import { test, expect, type Browser, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import {
  DATABASE_URL,
  EDITOR,
  adminUserId,
  createOwnedCategory,
  createOwnedMachine,
  deleteEditorFixtures,
  ensureEditor,
  removeEditor,
  storedCategory,
  storedMachine,
} from './admin-editor';
import { openPasteUrl, waitForHydration } from './admin-form';
import { runInDbValue } from './db-fixture';

// Stage 4c: stored media URLs are restricted to the project's own Cloudinary
// cloud, and the rule lives in the Server Actions so an EDITOR cannot bypass
// the form. These tests use the test database, the real running admin app and
// the exact action wire calls:
//
//   - a foreign host is refused for machine gallery/datasheet and category
//     image on create and update, and nothing is written;
//   - an unchanged value already stored in the database (the legacy seed path)
//     still saves through the real machine form;
//   - the ordinary forms still save a Cloudinary-looking fixture URL.
//
// No upload happens: Cloudinary is never contacted, no credentials are needed
// and every URL is a fixture.

const en = copyFor('en');
const STAMP = `st4c-${Date.now().toString(36)}`;

const tag = (suffix: string) => `${STAMP}-${suffix}`;
const label = (suffix: string) => `E2E 4c ${STAMP} ${suffix}`;
const cloudPhoto = (suffix: string) =>
  `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/${STAMP}-${suffix}.jpg`;
const cloudDatasheet = (suffix: string) =>
  `https://res.cloudinary.com/demo-cloud/raw/upload/v1712345678/colina/datasheets/${STAMP}-${suffix}.pdf`;

const FOREIGN_IMAGE = 'https://evil.test/uploads/foreign.png';
const FOREIGN_DATASHEET = 'https://evil.test/uploads/foreign.pdf';
const LEGACY_IMAGE = `/images/seed/${STAMP}-legacy.jpg`;

const EDITOR_CATEGORY_SLUG = tag('editor-cat');
const EDITOR_MACHINE_SLUG = tag('editor-machine');
const LEGACY_MACHINE_SLUG = tag('legacy-machine');
const FORM_CATEGORY_SLUG = tag('form-cat');
const FORM_MACHINE_SLUG = tag('form-machine');

const FORM_CATEGORY_NAME = label('Form category');
const NEW_CATEGORY_NAME = label('Created category');
const FORM_MACHINE_NAME = label('Form machine');
const LEGACY_MACHINE_NAME = label('Legacy machine');

let adminId = '';
let editorCategoryId = '';
let editorMachineId = '';

function adminContext(browser: Browser) {
  return loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD).then((state) =>
    browser.newContext({ storageState: state })
  );
}

function editorContext(browser: Browser) {
  return loginState(browser, en, EDITOR.email, EDITOR.password).then((state) =>
    browser.newContext({ storageState: state })
  );
}

const ACTION_FILES: Record<string, string> = {
  createMachine: 'lib/actions/machines.ts',
  updateMachine: 'lib/actions/machines.ts',
  createCategory: 'lib/actions/categories.ts',
  updateCategory: 'lib/actions/categories.ts',
};

/** Server Action id from the dev (or built) reference manifest. */
function actionId(exportedName: keyof typeof ACTION_FILES): string {
  const suffix = ACTION_FILES[exportedName];
  for (const relative of [
    '../apps/admin/.next/dev/server/server-reference-manifest.json',
    '../apps/admin/.next/server/server-reference-manifest.json',
  ]) {
    try {
      const manifest = JSON.parse(
        readFileSync(join(__dirname, relative), 'utf8')
      ) as {
        node?: Record<string, { filename?: string; exportedName?: string }>;
      };
      const match = Object.entries(manifest.node ?? {}).find(
        ([, value]) =>
          (value.filename ?? '').endsWith(suffix) &&
          value.exportedName === exportedName
      );
      if (match) {
        return match[0];
      }
    } catch {
      // No manifest (or not compiled yet): try the next location.
    }
  }
  throw new Error(`no Server Action id for ${exportedName}`);
}

type WireResult = { status: number; text: string };

/** The same POST the browser makes for a plain-argument Server Action. */
async function callAction(
  page: Page,
  exportedName: keyof typeof ACTION_FILES,
  url: string,
  args: unknown[]
): Promise<WireResult> {
  return page.evaluate(
    async (request: { action: string; url: string; args: unknown[] }) => {
      const reply = await fetch(request.url, {
        method: 'POST',
        headers: {
          'Next-Action': request.action,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request.args),
        signal: AbortSignal.timeout(30_000),
      });
      return {
        status: reply.status,
        text: (await reply.text()).slice(0, 60_000),
      };
    },
    { action: actionId(exportedName), url, args }
  );
}

function expectRefused(result: WireResult, code: string) {
  expect(result.text, JSON.stringify(result).slice(0, 800)).not.toContain(
    '"ok":true'
  );
  expect(result.text, JSON.stringify(result).slice(0, 800)).toContain(
    `"error":"${code}"`
  );
}

/**
 * A table row whose cell text is exactly `text`. Plain `hasText` is a
 * substring match, and fixture names deliberately share a prefix.
 */
function row(page: Page, text: string) {
  return page
    .locator('tr')
    .filter({ has: page.getByText(text, { exact: true }) });
}

function machineInput(
  slug: string,
  nameEn: string,
  categoryId: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    nameAr: `آلة ${STAMP}`,
    nameEn,
    slug,
    categoryId,
    shortDescriptionAr: 'وصف قصير لآلة الاختبار.',
    shortDescriptionEn: 'Short fixture description for the machine.',
    descriptionAr: '',
    descriptionEn: '',
    specsAr: '',
    specsEn: '',
    datasheetUrl: '',
    images: [],
    relatedIds: [],
    ...overrides,
  };
}

function categoryInput(
  slug: string,
  nameEn: string,
  overrides: Record<string, unknown> = {}
) {
  return {
    nameAr: `فئة ${STAMP}`,
    nameEn,
    slug,
    descriptionAr: '',
    descriptionEn: '',
    image: '',
    ...overrides,
  };
}

/** The datasheet column, which the shared machine fixture does not select. */
function storedDatasheet(slug: string): string | null | undefined {
  return runInDbValue<string | null | undefined>(`
    const row = await prisma.machine.findUnique({
      where: { slug: ${JSON.stringify(slug)} },
      select: { datasheetUrl: true },
    });
    return row?.datasheetUrl;
  `);
}

test.describe('stored media allowlist (Stage 4c)', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL is required for media fixtures');
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test.beforeAll(() => {
    ensureEditor();
    adminId = adminUserId(ADMIN_EMAIL);

    editorCategoryId = createOwnedCategory({
      slug: EDITOR_CATEGORY_SLUG,
      nameEn: label('Editor category'),
      nameAr: `فئة المحرر ${STAMP}`,
      createdById: EDITOR.id,
      image: cloudPhoto('editor-category'),
    });
    editorMachineId = createOwnedMachine({
      slug: EDITOR_MACHINE_SLUG,
      nameEn: label('Editor machine'),
      nameAr: `آلة المحرر ${STAMP}`,
      categorySlug: EDITOR_CATEGORY_SLUG,
      createdById: EDITOR.id,
      images: [{ url: cloudPhoto('editor-gallery'), position: 0 }],
    });

    // The legacy row: its stored gallery URL predates the allowlist, so only
    // an exact unchanged save is accepted.
    createOwnedCategory({
      slug: FORM_CATEGORY_SLUG,
      nameEn: FORM_CATEGORY_NAME,
      nameAr: `فئة النموذج ${STAMP}`,
      createdById: adminId,
    });
    createOwnedMachine({
      slug: LEGACY_MACHINE_SLUG,
      nameEn: LEGACY_MACHINE_NAME,
      nameAr: `آلة قديمة ${STAMP}`,
      categorySlug: FORM_CATEGORY_SLUG,
      createdById: adminId,
      images: [{ url: LEGACY_IMAGE, position: 0 }],
    });
    // A normal admin-owned row whose media can be replaced through the form.
    createOwnedMachine({
      slug: FORM_MACHINE_SLUG,
      nameEn: FORM_MACHINE_NAME,
      nameAr: `آلة النموذج ${STAMP}`,
      categorySlug: FORM_CATEGORY_SLUG,
      createdById: adminId,
      images: [{ url: cloudPhoto('form-gallery-old'), position: 0 }],
      datasheetUrl: cloudDatasheet('form-old'),
    });
  });

  test.afterAll(() => {
    if (!DATABASE_URL) {
      return;
    }
    deleteEditorFixtures(STAMP);
    removeEditor();
  });

  test('editor cannot save foreign machine or category media through direct action calls', async ({
    browser,
  }) => {
    const context = await editorContext(browser);
    const page = await context.newPage();
    // Compile both action modules first: the action id comes from the dev
    // server's reference manifest, which only knows modules it has built.
    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await page.goto(`${ADMIN_URL}/en/machines/new`);

    const categoryBefore = storedCategory(EDITOR_CATEGORY_SLUG);
    const machineBefore = storedMachine(EDITOR_MACHINE_SLUG);
    expect(categoryBefore?.image).toBe(cloudPhoto('editor-category'));
    expect(machineBefore?.images).toEqual([cloudPhoto('editor-gallery')]);

    // A new category with a foreign cover: refused, no row.
    expectRefused(
      await callAction(
        page,
        'createCategory',
        `${ADMIN_URL}/en/categories/new`,
        [
          categoryInput(tag('crafted-category'), label('Crafted category'), {
            image: FOREIGN_IMAGE,
          }),
        ]
      ),
      'validation_failed'
    );
    expect(storedCategory(tag('crafted-category'))).toBeNull();

    // Changing its own category's image to a foreign host: refused and the
    // stored value is untouched.
    expectRefused(
      await callAction(
        page,
        'updateCategory',
        `${ADMIN_URL}/en/categories/new`,
        [
          editorCategoryId,
          categoryInput(EDITOR_CATEGORY_SLUG, label('Editor category'), {
            image: FOREIGN_IMAGE,
          }),
        ]
      ),
      'validation_failed'
    );
    expect(storedCategory(EDITOR_CATEGORY_SLUG)).toEqual(categoryBefore);

    // A new machine with a foreign gallery image: refused, no row.
    expectRefused(
      await callAction(page, 'createMachine', `${ADMIN_URL}/en/machines/new`, [
        machineInput(
          tag('crafted-machine'),
          label('Crafted machine'),
          editorCategoryId,
          { images: [{ url: FOREIGN_IMAGE, position: 0 }] }
        ),
      ]),
      'validation_failed'
    );
    expect(storedMachine(tag('crafted-machine'))).toBeNull();

    // Its own machine, changed gallery and datasheet: each foreign value is
    // refused and the stored row keeps the old gallery.
    expectRefused(
      await callAction(page, 'updateMachine', `${ADMIN_URL}/en/machines/new`, [
        editorMachineId,
        machineInput(
          EDITOR_MACHINE_SLUG,
          label('Editor machine'),
          editorCategoryId,
          { images: [{ url: FOREIGN_IMAGE, position: 0 }] }
        ),
      ]),
      'validation_failed'
    );
    expect(storedMachine(EDITOR_MACHINE_SLUG)).toEqual(machineBefore);

    expectRefused(
      await callAction(page, 'updateMachine', `${ADMIN_URL}/en/machines/new`, [
        editorMachineId,
        machineInput(
          EDITOR_MACHINE_SLUG,
          label('Editor machine'),
          editorCategoryId,
          {
            datasheetUrl: FOREIGN_DATASHEET,
            images: [{ url: cloudPhoto('editor-gallery'), position: 0 }],
          }
        ),
      ]),
      'validation_failed'
    );
    expect(storedMachine(EDITOR_MACHINE_SLUG)).toEqual(machineBefore);

    await context.close();
  });

  test('admin edits a machine with a legacy image and saves it unchanged', async ({
    browser,
  }) => {
    const context = await adminContext(browser);
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/machines`);
    await row(page, LEGACY_MACHINE_NAME)
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/machines/[^/]+/edit$`));

    // The legacy path is what the form holds; the image input is not touched.
    await waitForHydration(page);
    await expect(page.getByAltText('Current image')).toHaveCount(1);
    await page
      .getByLabel('Name (English)')
      .fill(`${LEGACY_MACHINE_NAME} Renamed`);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(row(page, `${LEGACY_MACHINE_NAME} Renamed`)).toBeVisible();
    expect(storedMachine(LEGACY_MACHINE_SLUG)).toMatchObject({
      nameEn: `${LEGACY_MACHINE_NAME} Renamed`,
      images: [LEGACY_IMAGE],
    });

    await context.close();
  });

  test('admin forms still save Cloudinary-looking fixture URLs', async ({
    browser,
  }) => {
    const context = await adminContext(browser);
    const page = await context.newPage();

    // Category form: the ordinary path, including the collapsed URL field.
    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await waitForHydration(page);
    await page.getByLabel('Name (English)').fill(NEW_CATEGORY_NAME);
    await page.getByLabel('Name (Arabic)').fill(`فئة النموذج ${STAMP}`);
    await page.getByLabel('Slug').fill(tag('new-category'));
    await page
      .getByLabel('Description (English)')
      .fill('Category saved through the form with a fixture image.');
    await page.getByLabel('Description (Arabic)').fill('وصف فئة النموذج.');
    await openPasteUrl(
      page.getByRole('button', { name: 'Or paste a URL' }),
      page.locator('#cat-image-url')
    );
    await page.locator('#cat-image-url').fill(cloudPhoto('form-category'));
    await page.getByRole('button', { name: 'Create category' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    expect(storedCategory(tag('new-category'))?.image).toBe(
      cloudPhoto('form-category')
    );

    // Machine form: replace the gallery image and the datasheet with fixtures
    // on the configured cloud. (A brand-new machine has no image row until an
    // upload succeeds, so the ordinary paste path is exercised on edit.)
    await page.goto(`${ADMIN_URL}/en/machines`);
    await row(page, FORM_MACHINE_NAME)
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/machines/[^/]+/edit$`));
    await waitForHydration(page);
    await expect(page.getByAltText('Current image')).toHaveCount(1);

    await openPasteUrl(
      page.getByRole('button', { name: 'Or paste a URL for image 1' }),
      page.locator('#machine-image-0-url')
    );
    await page.locator('#machine-image-0-url').fill(cloudPhoto('form-gallery'));

    await openPasteUrl(
      page.getByRole('button', { name: 'Or paste a URL for the datasheet' }),
      page.locator('#machine-datasheet-url')
    );
    await page.locator('#machine-datasheet-url').fill(cloudDatasheet('form'));

    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    const saved = storedMachine(FORM_MACHINE_SLUG);
    expect(saved?.images).toEqual([cloudPhoto('form-gallery')]);
    expect(storedDatasheet(FORM_MACHINE_SLUG)).toBe(cloudDatasheet('form'));

    await context.close();
  });
});
