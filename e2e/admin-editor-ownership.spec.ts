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
  EDITOR_B,
  EDITOR_FIXTURE_TAG,
  adminUserId,
  auditRowsFor,
  createOwnedCategory,
  createOwnedMachine,
  deleteEditorFixtures,
  ensureEditor,
  ensureEditorB,
  removeEditor,
  removeEditorB,
  storedCategory,
  storedMachine,
} from './admin-editor';

// Stage 4a: the EDITOR role is not a UI preference. These tests drive the real
// forms for what an editor may do, and replay the exact Server Action wire
// calls for what it may not: guessed ids, another owner's rows, null-created
// legacy rows, and upload targets outside machine media.
//
// Fixtures are written straight to the test database because the panel has no
// UI that can hand a row to a different owner. Every row carries STAMP in its
// slug and image URLs, and cleanup deletes by that tag.

const en = copyFor('en');
const STAMP = `${EDITOR_FIXTURE_TAG}-${Date.now().toString(36)}`;

const tag = (suffix: string) => `${STAMP}-${suffix}`;
const label = (suffix: string) => `E2E 4a ${STAMP} ${suffix}`;
const photo = (suffix: string) =>
  `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/${STAMP}-${suffix}.jpg`;

const UI_CATEGORY_SLUG = tag('ui-cat');
const UI_CATEGORY_NAME = label('UI category');
const UI_CATEGORY_RENAMED = `${UI_CATEGORY_NAME} Renamed`;
const UI_MACHINE_SLUG = tag('ui-machine');
const UI_MACHINE_NAME = label('UI machine');
const UI_MACHINE_RENAMED = `${UI_MACHINE_NAME} Renamed`;

let adminId = '';
let catAId = '';
let catBId = '';
let catNullId = '';
let catAdminId = '';
let catBlockId = '';
let machineAId = '';
let machineBId = '';
let machineNullId = '';
let machineAdminId = '';
let machineBlockedId = '';

function editorContext(
  browser: Browser,
  account: { email: string; password: string }
) {
  return loginState(browser, en, account.email, account.password).then(
    (state) => browser.newContext({ storageState: state })
  );
}

const ACTION_FILES: Record<string, string> = {
  createMachine: 'lib/actions/machines.ts',
  updateMachine: 'lib/actions/machines.ts',
  deleteMachine: 'lib/actions/machines.ts',
  createCategory: 'lib/actions/categories.ts',
  updateCategory: 'lib/actions/categories.ts',
  deleteCategory: 'lib/actions/categories.ts',
  uploadImage: 'lib/actions/uploads.ts',
  uploadDatasheet: 'lib/actions/uploads.ts',
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

/**
 * The multipart shape React uses for a Server Action taking one FormData:
 * root field `0` is the argument list `["$K1"]` and the instance's entries are
 * `_1_<name>`. A text file is used on purpose: it is rejected by MIME before
 * Cloudinary, but only AFTER the capability and ownership gates — which is the
 * ordering these tests need to observe without a real upload.
 */
async function callUpload(
  page: Page,
  exportedName: 'uploadImage' | 'uploadDatasheet',
  target: { kind: 'machine' | 'category' | 'other'; id?: string }
): Promise<WireResult> {
  return page.evaluate(
    async (request: {
      action: string;
      url: string;
      target: { kind: string; id?: string };
    }) => {
      const formData = new FormData();
      formData.set('_1_target', request.target.kind);
      if (request.target.id) {
        formData.set('_1_targetId', request.target.id);
      }
      formData.set(
        '_1_file',
        new File([new TextEncoder().encode('not an image')], 'probe.txt', {
          type: 'text/plain',
        })
      );
      // The root reference must arrive after the nested parts it points at:
      // the multipart decoder resolves `$K1` as it streams.
      formData.set('0', JSON.stringify(['$K1']));
      const reply = await fetch(request.url, {
        method: 'POST',
        headers: { 'Next-Action': request.action },
        body: formData,
        signal: AbortSignal.timeout(30_000),
      });
      return {
        status: reply.status,
        text: (await reply.text()).slice(0, 60_000),
      };
    },
    {
      action: actionId(exportedName),
      url: `${ADMIN_URL}/en/machines/new`,
      target,
    }
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
 * substring match, and the fixture names deliberately share a prefix
 * ("Machine A" / "Machine admin"), so it would resolve two rows.
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

test.describe('editor role: ownership, permissions and navigation', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL is required for editor fixtures');
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test.beforeAll(() => {
    ensureEditor();
    ensureEditorB();
    adminId = adminUserId(ADMIN_EMAIL);

    catAId = createOwnedCategory({
      slug: tag('cat-a'),
      nameEn: label('Category A'),
      nameAr: `فئة أ ${STAMP}`,
      createdById: EDITOR.id,
    });
    catBId = createOwnedCategory({
      slug: tag('cat-b'),
      nameEn: label('Category B'),
      nameAr: `فئة ب ${STAMP}`,
      createdById: EDITOR_B.id,
    });
    catNullId = createOwnedCategory({
      slug: tag('cat-null'),
      nameEn: label('Category legacy'),
      nameAr: `فئة قديمة ${STAMP}`,
      createdById: null,
    });
    catAdminId = createOwnedCategory({
      slug: tag('cat-admin'),
      nameEn: label('Category admin'),
      nameAr: `فئة المدير ${STAMP}`,
      createdById: adminId,
    });
    catBlockId = createOwnedCategory({
      slug: tag('cat-block'),
      nameEn: label('Category delete block'),
      nameAr: `فئة الحظر ${STAMP}`,
      createdById: EDITOR.id,
    });

    machineAId = createOwnedMachine({
      slug: tag('machine-a'),
      nameEn: label('Machine A'),
      nameAr: `آلة أ ${STAMP}`,
      categorySlug: tag('cat-a'),
      createdById: EDITOR.id,
      images: [
        { url: photo('a-first'), position: 0 },
        { url: photo('a-second'), position: 1 },
      ],
    });
    machineBId = createOwnedMachine({
      slug: tag('machine-b'),
      nameEn: label('Machine B'),
      nameAr: `آلة ب ${STAMP}`,
      categorySlug: tag('cat-b'),
      createdById: EDITOR_B.id,
      images: [{ url: photo('b-first'), position: 0 }],
    });
    machineNullId = createOwnedMachine({
      slug: tag('machine-null'),
      nameEn: label('Machine legacy'),
      nameAr: `آلة قديمة ${STAMP}`,
      categorySlug: tag('cat-null'),
      createdById: null,
    });
    machineAdminId = createOwnedMachine({
      slug: tag('machine-admin'),
      nameEn: label('Machine admin'),
      nameAr: `آلة المدير ${STAMP}`,
      categorySlug: tag('cat-admin'),
      createdById: adminId,
    });
    // Editor B's machine sits inside a category editor A created: deleting it
    // must be blocked by the existing has-machines rule.
    machineBlockedId = createOwnedMachine({
      slug: tag('machine-blocked'),
      nameEn: label('Machine blocked'),
      nameAr: `آلة محظورة ${STAMP}`,
      categorySlug: tag('cat-block'),
      createdById: EDITOR_B.id,
    });
  });

  test.afterAll(() => {
    if (!DATABASE_URL) {
      return;
    }
    deleteEditorFixtures(STAMP);
    removeEditorB();
    removeEditor();
  });

  test('editor lands on machines and every other area is closed', async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();

    // The dashboard is a full-admin screen; an editor is redirected before any
    // count query runs.
    await page.goto(`${ADMIN_URL}/en`);
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Machines' })
    ).toBeVisible();

    // Sidebar: exactly Machines + Categories, and no system entries.
    const nav = page.locator('aside nav').first();
    await expect(nav.getByRole('link')).toHaveCount(2);
    await expect(
      nav.getByRole('link', { name: 'Machines', exact: true })
    ).toBeVisible();
    await expect(
      nav.getByRole('link', { name: 'Categories', exact: true })
    ).toBeVisible();
    const navText = (await nav.textContent()) ?? '';
    for (const hidden of [
      'Leads',
      'Site settings',
      'Insights',
      'Audit log',
      'Partners',
      'News',
      'Agents',
      'Maintenance machines',
      'Maintenance categories',
      'Maintenance services',
    ]) {
      expect(navText, hidden).not.toContain(hidden);
    }
    await expect(page.getByText('Editor', { exact: true })).toBeVisible();

    // Content sections redirect to the editor's only landing page.
    for (const path of [
      '/leads',
      '/partners',
      '/services',
      '/news',
      '/agents',
      '/maintenance-categories',
      '/maintenance-showcase',
    ]) {
      await page.goto(`${ADMIN_URL}/en${path}`);
      await expect(page, path).toHaveURL(`${ADMIN_URL}/en/machines`);
    }

    // The three pages with an explanatory card keep it.
    for (const path of ['/settings', '/insights', '/audit-log']) {
      await page.goto(`${ADMIN_URL}/en${path}`);
      await expect(page, path).toHaveURL(`${ADMIN_URL}/en${path}`);
      await expect(page.getByText(en.denied)).toBeVisible();
    }

    await context.close();
  });

  test('editor creates and edits its own category with an image', async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await page.getByLabel('Name (English)').fill(UI_CATEGORY_NAME);
    await page.getByLabel('Name (Arabic)').fill(`فئة واجهة ${STAMP}`);
    await page.getByLabel('Slug').fill(UI_CATEGORY_SLUG);
    await page
      .getByLabel('Description (English)')
      .fill('Category created by an editor through the real form.');
    await page.getByLabel('Description (Arabic)').fill('وصف فئة المحرر.');
    await page.getByRole('button', { name: 'Or paste a URL' }).click();
    await page.locator('#cat-image-url').fill(photo('ui-cat-first'));
    await page.getByRole('button', { name: 'Create category' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(row(page, UI_CATEGORY_NAME)).toBeVisible();

    const created = storedCategory(UI_CATEGORY_SLUG);
    expect(created).toMatchObject({
      nameEn: UI_CATEGORY_NAME,
      createdById: EDITOR.id,
      image: photo('ui-cat-first'),
    });
    expect(auditRowsFor([`MachineCategory:${UI_CATEGORY_SLUG}`])).toEqual([
      {
        action: 'CATEGORY_CREATE',
        entity: `MachineCategory:${UI_CATEGORY_SLUG}`,
        adminUserId: EDITOR.id,
      },
    ]);

    // Rename and replace the image: both halves an editor owns on its row.
    await row(page, UI_CATEGORY_NAME)
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/categories\/[^/]+\/edit$/);
    await page.getByLabel('Name (English)').fill(UI_CATEGORY_RENAMED);
    await page.getByRole('button', { name: 'Or paste a URL' }).click();
    await page.locator('#cat-image-url').fill(photo('ui-cat-second'));
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(row(page, UI_CATEGORY_RENAMED)).toBeVisible();
    expect(storedCategory(UI_CATEGORY_SLUG)).toMatchObject({
      nameEn: UI_CATEGORY_RENAMED,
      createdById: EDITOR.id,
      image: photo('ui-cat-second'),
    });

    const audits = auditRowsFor([`MachineCategory:${UI_CATEGORY_SLUG}`]);
    expect(audits.map((row) => row.action)).toEqual([
      'CATEGORY_CREATE',
      'CATEGORY_UPDATE',
    ]);
    expect(audits.every((row) => row.adminUserId === EDITOR.id)).toBe(true);

    await context.close();
  });

  test('editor creates, edits and deletes a machine, and lists only its own rows', async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();

    // The machine form may file a machine under ANY category: it sees all
    // category names, even though the management list does not.
    await page.goto(`${ADMIN_URL}/en/machines/new`);
    const categoryOptions = await page
      .locator('#machine-category option')
      .allTextContents();
    for (const visible of [
      label('Category B'),
      label('Category legacy'),
      label('Category admin'),
    ]) {
      expect(categoryOptions).toContain(visible);
    }

    await page.getByLabel('Name (English)').fill(UI_MACHINE_NAME);
    await page.getByLabel('Name (Arabic)').fill(`آلة واجهة ${STAMP}`);
    await page.getByLabel('Slug').fill(UI_MACHINE_SLUG);
    await page
      .getByLabel('Category')
      .selectOption({ label: UI_CATEGORY_RENAMED });
    await page
      .getByLabel('Short description (English)')
      .fill('Short description written by an editor.');
    await page
      .getByLabel('Short description (Arabic)')
      .fill('وصف قصير كتبه المحرر.');
    await page
      .getByLabel('Full description (English)')
      .fill('Full description written by an editor.');
    await page
      .getByLabel('Full description (Arabic)')
      .fill('وصف كامل كتبه المحرر.');
    await page.getByLabel('Specs (English)').fill('Editor specs.');
    await page.getByLabel('Specs (Arabic)').fill('مواصفات المحرر.');
    await page.getByRole('button', { name: 'Create machine' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(row(page, UI_MACHINE_NAME)).toBeVisible();

    expect(storedMachine(UI_MACHINE_SLUG)).toMatchObject({
      nameEn: UI_MACHINE_NAME,
      createdById: EDITOR.id,
    });
    let audits = auditRowsFor([`Machine:${UI_MACHINE_SLUG}`]);
    expect(audits).toEqual([
      {
        action: 'MACHINE_CREATE',
        entity: `Machine:${UI_MACHINE_SLUG}`,
        adminUserId: EDITOR.id,
      },
    ]);

    // Machine management list: own rows only (the fixture created by editor A
    // plus the new one), never B's, the admin's or the null-creator row.
    await page.goto(`${ADMIN_URL}/en/machines`);
    await expect(row(page, label('Machine A'))).toBeVisible();
    await expect(row(page, UI_MACHINE_NAME)).toBeVisible();
    for (const foreign of [
      label('Machine B'),
      label('Machine legacy'),
      label('Machine admin'),
      label('Machine blocked'),
    ]) {
      await expect(row(page, foreign)).toHaveCount(0);
    }

    // Category management list: own rows only.
    await page.goto(`${ADMIN_URL}/en/categories`);
    await expect(row(page, UI_CATEGORY_RENAMED)).toBeVisible();
    await expect(row(page, label('Category A'))).toBeVisible();
    await expect(row(page, label('Category delete block'))).toBeVisible();
    for (const foreign of [
      label('Category B'),
      label('Category legacy'),
      label('Category admin'),
    ]) {
      await expect(row(page, foreign)).toHaveCount(0);
    }

    // The machines-page category filter follows the same ownership rule.
    await page.goto(`${ADMIN_URL}/en/machines`);
    const filterOptions = await page
      .locator('#machine-category-filter option')
      .allTextContents();
    expect(filterOptions).toContain(UI_CATEGORY_RENAMED);
    expect(filterOptions).toContain(label('Category A'));
    expect(filterOptions).toContain(label('Category delete block'));
    for (const foreign of [
      label('Category B'),
      label('Category legacy'),
      label('Category admin'),
    ]) {
      expect(filterOptions).not.toContain(foreign);
    }

    // Rename its own machine through the edit form.
    await row(page, UI_MACHINE_NAME)
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await page.getByLabel('Name (English)').fill(UI_MACHINE_RENAMED);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    expect(storedMachine(UI_MACHINE_SLUG)).toMatchObject({
      nameEn: UI_MACHINE_RENAMED,
      createdById: EDITOR.id,
    });

    // Delete its own machine, then its own now-empty category.
    await row(page, UI_MACHINE_RENAMED)
      .getByRole('button', { name: `Delete ${UI_MACHINE_RENAMED}` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, UI_MACHINE_RENAMED)).toHaveCount(0);
    expect(storedMachine(UI_MACHINE_SLUG)).toBeNull();

    await page.goto(`${ADMIN_URL}/en/categories`);
    await row(page, UI_CATEGORY_RENAMED)
      .getByRole('button', { name: `Delete ${UI_CATEGORY_RENAMED}` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, UI_CATEGORY_RENAMED)).toHaveCount(0);
    expect(storedCategory(UI_CATEGORY_SLUG)).toBeNull();

    audits = auditRowsFor([`Machine:${UI_MACHINE_SLUG}`]);
    expect(audits.map((row) => row.action)).toEqual([
      'MACHINE_CREATE',
      'MACHINE_UPDATE',
      'MACHINE_DELETE',
    ]);
    expect(audits.every((row) => row.adminUserId === EDITOR.id)).toBe(true);

    audits = auditRowsFor([`MachineCategory:${UI_CATEGORY_SLUG}`]);
    expect(audits.map((row) => row.action)).toEqual([
      'CATEGORY_CREATE',
      'CATEGORY_UPDATE',
      'CATEGORY_DELETE',
    ]);
    expect(audits.every((row) => row.adminUserId === EDITOR.id)).toBe(true);

    await context.close();
  });

  test('editor reorders and replaces images on a machine it created', async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/machines`);
    await row(page, label('Machine A'))
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(new RegExp(`/machines/${machineAId}/edit$`));
    await expect(page.getByAltText('Current image')).toHaveCount(2);

    const replacement = photo('a-second-replaced');
    await page
      .getByRole('button', { name: 'Or paste a URL for image 2' })
      .click();
    await page.locator('#machine-image-1-url').fill(replacement);
    await page.getByRole('button', { name: 'Move image 2 earlier' }).click();
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    expect(storedMachine(tag('machine-a'))?.images).toEqual([
      replacement,
      photo('a-first'),
    ]);
    const audits = auditRowsFor([`Machine:${tag('machine-a')}`]);
    expect(
      audits.some(
        (row) =>
          row.action === 'MACHINE_UPDATE' && row.adminUserId === EDITOR.id
      )
    ).toBe(true);

    // A guessed id on a page is a 404, not another owner's row.
    const foreignMachine = await page.goto(
      `${ADMIN_URL}/en/machines/${machineBId}/edit`
    );
    expect(foreignMachine?.status()).toBe(404);
    const foreignCategory = await page.goto(
      `${ADMIN_URL}/en/categories/${catBId}/edit`
    );
    expect(foreignCategory?.status()).toBe(404);

    await context.close();
  });

  test("editor cannot touch another owner's rows through direct action calls", async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/machines`);

    const targets = [
      `Machine:${tag('machine-b')}`,
      `Machine:${tag('machine-null')}`,
      `Machine:${tag('machine-admin')}`,
      `MachineCategory:${tag('cat-b')}`,
      `MachineCategory:${tag('cat-null')}`,
      `MachineCategory:${tag('cat-admin')}`,
    ];
    const auditCountBefore = auditRowsFor(targets).length;
    const foreignMachineBefore = storedMachine(tag('machine-b'));
    const foreignCategoryBefore = storedCategory(tag('cat-b'));

    // Another editor's machine: update and delete both answer not_found, and
    // the row is unchanged.
    expectRefused(
      await callAction(page, 'updateMachine', `${ADMIN_URL}/en/machines/new`, [
        machineBId,
        machineInput(
          tag('machine-b'),
          `${label('Machine B')} hijacked`,
          catBId,
          { images: [{ url: photo('b-hijacked'), position: 0 }] }
        ),
      ]),
      'not_found'
    );
    expect(storedMachine(tag('machine-b'))).toEqual(foreignMachineBefore);

    for (const machineId of [machineBId, machineNullId, machineAdminId]) {
      expectRefused(
        await callAction(page, 'deleteMachine', `${ADMIN_URL}/en/machines`, [
          machineId,
        ]),
        'not_found'
      );
    }
    expect(storedMachine(tag('machine-b'))).not.toBeNull();
    expect(storedMachine(tag('machine-null'))).not.toBeNull();
    expect(storedMachine(tag('machine-admin'))).not.toBeNull();

    // Another editor's category and the null/admin legacy categories.
    expectRefused(
      await callAction(
        page,
        'updateCategory',
        `${ADMIN_URL}/en/categories/new`,
        [
          catBId,
          {
            nameAr: `فئة مخترقة ${STAMP}`,
            nameEn: `${label('Category B')} hijacked`,
            slug: tag('cat-b'),
            descriptionAr: '',
            descriptionEn: '',
            image: '',
          },
        ]
      ),
      'not_found'
    );
    expect(storedCategory(tag('cat-b'))).toEqual(foreignCategoryBefore);

    for (const categoryId of [catBId, catNullId, catAdminId]) {
      expectRefused(
        await callAction(page, 'deleteCategory', `${ADMIN_URL}/en/categories`, [
          categoryId,
        ]),
        'not_found'
      );
    }
    expect(storedCategory(tag('cat-b'))).not.toBeNull();
    expect(storedCategory(tag('cat-null'))).not.toBeNull();
    expect(storedCategory(tag('cat-admin'))).not.toBeNull();

    // Linking a foreign machine into a new one edits the join table around
    // that row, so it is refused before any insert.
    expectRefused(
      await callAction(page, 'createMachine', `${ADMIN_URL}/en/machines/new`, [
        machineInput(tag('crafted'), label('Crafted machine'), catAId, {
          relatedIds: [machineBId],
        }),
      ]),
      'not_found'
    );
    expect(storedMachine(tag('crafted'))).toBeNull();

    // No refused call may leave an audit row behind.
    expect(auditRowsFor(targets)).toHaveLength(auditCountBefore);

    // Uploads: capability first (the generic media context is full-admin
    // only), then ownership (foreign and null-creator rows are forbidden).
    expectRefused(
      await callUpload(page, 'uploadImage', { kind: 'other' }),
      'unauthorized'
    );
    for (const target of [
      { kind: 'machine' as const, id: machineBId },
      { kind: 'machine' as const, id: machineNullId },
      { kind: 'category' as const, id: catBId },
      { kind: 'machine' as const, id: 'does-not-exist' },
    ]) {
      expectRefused(await callUpload(page, 'uploadImage', target), 'forbidden');
    }
    expectRefused(
      await callUpload(page, 'uploadDatasheet', {
        kind: 'machine',
        id: machineBId,
      }),
      'forbidden'
    );

    // Its own rows pass both gates; the text file is then refused by MIME
    // before Cloudinary, which is the observable proof that ownership allowed
    // it (and costs no network upload).
    for (const target of [
      { kind: 'machine' as const, id: machineAId },
      { kind: 'category' as const, id: catAId },
    ]) {
      const own = await callUpload(page, 'uploadImage', target);
      expect(own.text).not.toContain('"error":"forbidden"');
      expect(own.text).not.toContain('"error":"unauthorized"');
      // The text file is refused before Cloudinary. `unconfigured` is the
      // acceptable alternative when the E2E environment has no Cloudinary
      // credentials; either answer means the ownership gate let the request
      // through.
      expect(own.text).toMatch(/"error":"(invalid_type|unconfigured)"/);
    }

    await context.close();
  });

  test('editor cannot delete its category while another owner\u2019s machine is in it', async ({
    browser,
  }) => {
    const context = await editorContext(browser, EDITOR);
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/categories`);

    expectRefused(
      await callAction(page, 'deleteCategory', `${ADMIN_URL}/en/categories`, [
        catBlockId,
      ]),
      'has_machines'
    );

    expect(storedCategory(tag('cat-block'))).not.toBeNull();
    expect(storedMachine(tag('machine-blocked'))).not.toBeNull();
    expect(machineBlockedId).toBeTruthy();

    await context.close();
  });

  test('editor B sees only its own rows too', async ({ browser }) => {
    const context = await editorContext(browser, EDITOR_B);
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/machines`);
    await expect(row(page, label('Machine B'))).toBeVisible();
    for (const foreign of [
      label('Machine A'),
      label('Machine legacy'),
      label('Machine admin'),
    ]) {
      await expect(row(page, foreign)).toHaveCount(0);
    }

    await page.goto(`${ADMIN_URL}/en/categories`);
    await expect(row(page, label('Category B'))).toBeVisible();
    for (const foreign of [
      label('Category A'),
      label('Category legacy'),
      label('Category admin'),
    ]) {
      await expect(row(page, foreign)).toHaveCount(0);
    }

    const nav = page.locator('aside nav').first();
    await expect(nav.getByRole('link')).toHaveCount(2);

    const forbiddenPage = await page.goto(
      `${ADMIN_URL}/en/machines/${machineAId}/edit`
    );
    expect(forbiddenPage?.status()).toBe(404);
    expectRefused(
      await callAction(page, 'deleteMachine', `${ADMIN_URL}/en/machines`, [
        machineAId,
      ]),
      'not_found'
    );
    expect(storedMachine(tag('machine-a'))).not.toBeNull();

    await context.close();
  });

  test('a full admin keeps every power, including on editor-created rows', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    // The dashboard is still the admin landing page.
    await page.goto(`${ADMIN_URL}/en`);
    await expect(page).toHaveURL(`${ADMIN_URL}/en`);
    for (const path of ['/settings', '/insights', '/audit-log']) {
      await page.goto(`${ADMIN_URL}/en${path}`);
      await expect(page, path).toHaveURL(`${ADMIN_URL}/en${path}`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByText(en.denied)).toHaveCount(0);
    }

    // All fixtures are visible regardless of creator.
    await page.goto(`${ADMIN_URL}/en/machines`);
    for (const visible of [
      label('Machine A'),
      label('Machine B'),
      label('Machine legacy'),
      label('Machine admin'),
    ]) {
      await expect(row(page, visible)).toBeVisible();
    }

    // Edit a row created by editor B through the real form.
    const adminEdited = `${label('Machine B')} Admin edited`;
    await row(page, label('Machine B'))
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
    await page.getByLabel('Name (English)').fill(adminEdited);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    expect(storedMachine(tag('machine-b'))).toMatchObject({
      nameEn: adminEdited,
      createdById: EDITOR_B.id,
    });

    // Delete that editor-owned machine, then its now-empty category.
    await row(page, adminEdited)
      .getByRole('button', { name: `Delete ${adminEdited}` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, adminEdited)).toHaveCount(0);
    expect(storedMachine(tag('machine-b'))).toBeNull();

    await page.goto(`${ADMIN_URL}/en/categories`);
    const editorBCategory = label('Category B');
    await row(page, editorBCategory)
      .getByRole('button', { name: `Delete ${editorBCategory}` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, editorBCategory)).toHaveCount(0);
    expect(storedCategory(tag('cat-b'))).toBeNull();

    // A null-creator row (pre-Stage-4a content) is still the admin's to delete.
    await page.goto(`${ADMIN_URL}/en/machines`);
    const legacy = label('Machine legacy');
    await row(page, legacy)
      .getByRole('button', { name: `Delete ${legacy}` })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(row(page, legacy)).toHaveCount(0);
    expect(storedMachine(tag('machine-null'))).toBeNull();

    // Every write above is attributed to the admin, not to the row's creator.
    const machineAudits = auditRowsFor([`Machine:${tag('machine-b')}`]);
    expect(machineAudits.map((row) => row.action)).toEqual([
      'MACHINE_UPDATE',
      'MACHINE_DELETE',
    ]);
    expect(machineAudits.every((row) => row.adminUserId === adminId)).toBe(
      true
    );
    const categoryAudits = auditRowsFor([`MachineCategory:${tag('cat-b')}`]);
    expect(categoryAudits.map((row) => row.action)).toEqual([
      'CATEGORY_DELETE',
    ]);
    expect(categoryAudits.every((row) => row.adminUserId === adminId)).toBe(
      true
    );

    await context.close();
  });
});
