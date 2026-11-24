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
  deleteEditorFixtures,
  ensureEditor,
  removeEditor,
  storedCategory,
  storedMachine,
} from './admin-editor';
import { waitForHydration } from './admin-form';

// Stage 4e: an EDITOR's content is a draft until a full admin publishes it.
// This is one long lifecycle on purpose: each step changes the visibility of
// the same rows, and the public checks are only meaningful in that order.
//
// The public site is read through Playwright's API request client (with no
// admin cookies) so a 404 and the rendered HTML are the real anonymous view.
// Admin/list assertions use the real forms and real lists.

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const en = copyFor('en');

const STAMP = `st4e-${Date.now().toString(36)}`;
const CATEGORY_SLUG = `${STAMP}-category`;
const CATEGORY_NAME = `E2E 4e ${STAMP} category`;
const MACHINE_SLUG = `${STAMP}-machine`;
const MACHINE_NAME = `E2E 4e ${STAMP} machine`;
const CRAFTED_SLUG = `${STAMP}-crafted`;
const CRAFTED_NAME = `E2E 4e ${STAMP} crafted`;

const ACTION_FILES: Record<string, string> = {
  createMachine: 'lib/actions/machines.ts',
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

async function callCreateMachine(page: Page, args: unknown[]) {
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
    {
      action: actionId('createMachine'),
      url: `${ADMIN_URL}/en/machines/new`,
      args,
    }
  );
}

function editorContext(browser: Browser) {
  return loginState(browser, en, EDITOR.email, EDITOR.password).then((state) =>
    browser.newContext({ storageState: state })
  );
}

function adminContext(browser: Browser) {
  return loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD).then((state) =>
    browser.newContext({ storageState: state })
  );
}

function row(page: Page, text: string) {
  return page
    .locator('tr')
    .filter({ has: page.getByText(text, { exact: true }) });
}

async function bodyOf(
  request: {
    get: (
      url: string
    ) => Promise<{ status: () => number; text: () => Promise<string> }>;
  },
  path: string
) {
  const response = await request.get(`${WEB_URL}${path}`);
  return { status: response.status(), html: await response.text() };
}

async function expectPublicMissing(
  request: Parameters<typeof bodyOf>[0],
  path: string,
  ...hidden: string[]
) {
  const { status, html } = await bodyOf(request, path);
  expect(status, path).toBe(404);
  for (const text of hidden) {
    expect(html, `${path} must not contain ${text}`).not.toContain(text);
  }
}

async function expectPublicVisible(
  request: Parameters<typeof bodyOf>[0],
  path: string,
  text: string
) {
  const { status, html } = await bodyOf(request, path);
  expect(status, path).toBe(200);
  expect(html, `${path} must contain ${text}`).toContain(text);
}

test.describe('editor content is draft until a full admin publishes it', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL is required for editor fixtures');
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test.beforeAll(() => {
    ensureEditor();
  });

  test.afterAll(() => {
    if (!DATABASE_URL) {
      return;
    }
    deleteEditorFixtures(STAMP);
    removeEditor();
  });

  test('full publication lifecycle', async ({ browser, request }) => {
    test.slow();

    // Baseline: seeded content keeps its visibility through this migration.
    await expectPublicVisible(
      request,
      '/en/machines/colina-pro-1000',
      'Colina Pro 1000'
    );
    await expectPublicVisible(
      request,
      '/en/categories/packaging-machines',
      'Packaging'
    );
    const seededSitemap = await bodyOf(request, '/sitemap.xml');
    expect(seededSitemap.status).toBe(200);
    expect(seededSitemap.html).toContain('/en/machines/colina-pro-1000');

    // ---- EDITOR creates a category through the real form ----------------
    const editor = await editorContext(browser);
    const editorPage = await editor.newPage();
    await editorPage.goto(`${ADMIN_URL}/en/categories/new`);
    await waitForHydration(editorPage);
    await expect(editorPage.locator('#category-published')).toHaveCount(0);
    await expect(
      editorPage.getByText(/New categories are saved as drafts/)
    ).toBeVisible();
    await editorPage.getByLabel('Name (English)').fill(CATEGORY_NAME);
    await editorPage.getByLabel('Name (Arabic)').fill(`فئة 4e ${STAMP}`);
    await editorPage.getByLabel('Slug').fill(CATEGORY_SLUG);
    await editorPage
      .getByLabel('Description (English)')
      .fill('Category created by an editor and awaiting review.');
    await editorPage
      .getByLabel('Description (Arabic)')
      .fill('فئة أنشأها محرر وتنتظر المراجعة.');
    await editorPage.getByRole('button', { name: 'Create category' }).click();
    await expect(editorPage).toHaveURL(`${ADMIN_URL}/en/categories`);

    let category = storedCategory(CATEGORY_SLUG);
    expect(category).toMatchObject({
      isPublished: false,
      createdById: EDITOR.id,
    });
    await expect(row(editorPage, CATEGORY_NAME)).toContainText('Draft');
    await expect(row(editorPage, CATEGORY_NAME)).toContainText(
      'Created by editor'
    );

    await expectPublicMissing(
      request,
      `/en/categories/${CATEGORY_SLUG}`,
      CATEGORY_NAME
    );
    expect((await bodyOf(request, '/en/categories')).html).not.toContain(
      CATEGORY_NAME
    );
    expect((await bodyOf(request, '/en')).html).not.toContain(CATEGORY_NAME);
    expect((await bodyOf(request, '/sitemap.xml')).html).not.toContain(
      `/categories/${CATEGORY_SLUG}`
    );

    // ---- EDITOR creates a machine in that category ----------------------
    await editorPage.goto(`${ADMIN_URL}/en/machines/new`);
    await waitForHydration(editorPage);
    await expect(editorPage.locator('#machine-published')).toHaveCount(0);
    await expect(
      editorPage.getByText(/New machines are saved as drafts/)
    ).toBeVisible();
    await editorPage.getByLabel('Name (English)').fill(MACHINE_NAME);
    await editorPage.getByLabel('Name (Arabic)').fill(`آلة 4e ${STAMP}`);
    await editorPage.getByLabel('Slug').fill(MACHINE_SLUG);
    await editorPage
      .getByLabel('Category')
      .selectOption({ label: CATEGORY_NAME });
    await editorPage
      .getByLabel('Short description (English)')
      .fill('A machine created by an editor; invisible until reviewed.');
    await editorPage
      .getByLabel('Short description (Arabic)')
      .fill('آلة أنشأها محرر ولا تظهر حتى تُراجع.');
    await editorPage.getByRole('button', { name: 'Create machine' }).click();
    await expect(editorPage).toHaveURL(`${ADMIN_URL}/en/machines`);

    const machine = storedMachine(MACHINE_SLUG);
    expect(machine).toMatchObject({
      isPublished: false,
      createdById: EDITOR.id,
    });
    await expect(row(editorPage, MACHINE_NAME)).toContainText('Draft');
    await expect(row(editorPage, MACHINE_NAME)).toContainText(
      'Created by editor'
    );

    await expectPublicMissing(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );
    expect((await bodyOf(request, '/en/machines')).html).not.toContain(
      MACHINE_NAME
    );
    expect((await bodyOf(request, '/sitemap.xml')).html).not.toContain(
      `/machines/${MACHINE_SLUG}`
    );

    // ---- A crafted published=true call is still forced to draft ---------
    const categoryId = category?.id ?? '';
    const machineId = machine?.id ?? '';
    expect(categoryId).not.toBe('');
    expect(machineId).not.toBe('');

    const crafted = await callCreateMachine(editorPage, [
      {
        nameAr: `آلة مصنوعة 4e ${STAMP}`,
        nameEn: CRAFTED_NAME,
        slug: CRAFTED_SLUG,
        categoryId,
        shortDescriptionAr: 'وصف قصير لآلة مصنوعة للاختبار.',
        shortDescriptionEn: 'A crafted machine description for the test.',
        descriptionAr: '',
        descriptionEn: '',
        specsAr: '',
        specsEn: '',
        datasheetUrl: '',
        images: [],
        // Related to the editor's first machine: the public page below proves
        // a hidden target is stripped from the related strip.
        relatedIds: [machineId],
        // The editor may not publish, even if it says so explicitly.
        isPublished: true,
      },
    ]);
    expect(crafted.status).toBe(200);
    expect(crafted.text).toContain('"ok":true');

    const craftedMachine = storedMachine(CRAFTED_SLUG);
    expect(craftedMachine).toMatchObject({
      isPublished: false,
      createdById: EDITOR.id,
    });
    await expectPublicMissing(
      request,
      `/en/machines/${CRAFTED_SLUG}`,
      CRAFTED_NAME
    );
    await editor.close();

    // ---- A full admin publishes the category, then the machines ---------
    const admin = await adminContext(browser);
    const adminPage = await admin.newPage();

    await adminPage.goto(`${ADMIN_URL}/en/categories/${categoryId}/edit`);
    await waitForHydration(adminPage);
    const categoryToggle = adminPage.locator('#category-published');
    await expect(categoryToggle).not.toBeChecked();
    await adminPage.locator('label[for="category-published"]').click();
    await expect(categoryToggle).toBeChecked();
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage).toHaveURL(`${ADMIN_URL}/en/categories`);

    category = storedCategory(CATEGORY_SLUG);
    expect(category?.isPublished).toBe(true);
    await expectPublicVisible(
      request,
      `/en/categories/${CATEGORY_SLUG}`,
      CATEGORY_NAME
    );
    expect((await bodyOf(request, '/en/categories')).html).toContain(
      CATEGORY_NAME
    );

    // The machine is still its own draft even though its category is public.
    await expectPublicMissing(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );

    await adminPage.goto(`${ADMIN_URL}/en/machines/${machineId}/edit`);
    await waitForHydration(adminPage);
    const machineToggle = adminPage.locator('#machine-published');
    await expect(machineToggle).not.toBeChecked();
    await adminPage.locator('label[for="machine-published"]').click();
    await expect(machineToggle).toBeChecked();
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage).toHaveURL(`${ADMIN_URL}/en/machines`);

    expect(storedMachine(MACHINE_SLUG)?.isPublished).toBe(true);
    await expectPublicVisible(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );
    expect((await bodyOf(request, '/en/machines')).html).toContain(
      MACHINE_NAME
    );

    await adminPage.goto(`${ADMIN_URL}/en/machines/${craftedMachine?.id}/edit`);
    await waitForHydration(adminPage);
    const craftedToggle = adminPage.locator('#machine-published');
    await expect(craftedToggle).not.toBeChecked();
    await adminPage.locator('label[for="machine-published"]').click();
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage).toHaveURL(`${ADMIN_URL}/en/machines`);

    expect(storedMachine(CRAFTED_SLUG)?.isPublished).toBe(true);
    await expectPublicVisible(
      request,
      `/en/machines/${CRAFTED_SLUG}`,
      CRAFTED_NAME
    );
    // Both machines are public: the curated relation renders.
    expect(
      (await bodyOf(request, `/en/machines/${CRAFTED_SLUG}`)).html
    ).toContain(MACHINE_NAME);

    // ---- EDITOR edits the published machine: it returns to draft --------
    const editorAfterPublish = await editorContext(browser);
    const editorEditPage = await editorAfterPublish.newPage();
    await editorEditPage.goto(`${ADMIN_URL}/en/machines/${machineId}/edit`);
    await waitForHydration(editorEditPage);
    await expect(editorEditPage.locator('#machine-published')).toHaveCount(0);
    await expect(
      editorEditPage.getByText(
        /This machine is published\. Saving changes returns it to draft/
      )
    ).toBeVisible();
    await editorEditPage
      .getByLabel('Short description (English)')
      .fill('Edited by the editor, so this must go back to draft.');
    await editorEditPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(editorEditPage).toHaveURL(`${ADMIN_URL}/en/machines`);

    expect(storedMachine(MACHINE_SLUG)?.isPublished).toBe(false);
    await expectPublicMissing(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );
    expect((await bodyOf(request, '/en/machines')).html).not.toContain(
      MACHINE_NAME
    );
    // The published related machine no longer links to the hidden one.
    expect(
      (await bodyOf(request, `/en/machines/${CRAFTED_SLUG}`)).html
    ).not.toContain(MACHINE_NAME);

    await adminPage.goto(
      `${ADMIN_URL}/en/machines?status=awaiting-review&q=${encodeURIComponent(
        MACHINE_NAME
      )}`
    );
    const awaitingMachine = row(adminPage, MACHINE_NAME);
    await expect(awaitingMachine).toBeVisible();
    await expect(awaitingMachine).toContainText('Draft');
    await expect(awaitingMachine).toContainText('Created by editor');

    // ---- Admin republishes the machine ----------------------------------
    await adminPage.goto(`${ADMIN_URL}/en/machines/${machineId}/edit`);
    await waitForHydration(adminPage);
    await expect(adminPage.locator('#machine-published')).not.toBeChecked();
    await adminPage.locator('label[for="machine-published"]').click();
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage).toHaveURL(`${ADMIN_URL}/en/machines`);
    expect(storedMachine(MACHINE_SLUG)?.isPublished).toBe(true);
    await expectPublicVisible(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );

    // ---- EDITOR edits the published category: machine hidden by category -
    await editorEditPage.goto(`${ADMIN_URL}/en/categories/${categoryId}/edit`);
    await waitForHydration(editorEditPage);
    await expect(editorEditPage.locator('#category-published')).toHaveCount(0);
    await expect(
      editorEditPage.getByText(
        /This category is published\. Saving changes returns it to draft/
      )
    ).toBeVisible();
    await editorEditPage
      .getByLabel('Description (English)')
      .fill('Edited by the editor; the category returns to draft.');
    await editorEditPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(editorEditPage).toHaveURL(`${ADMIN_URL}/en/categories`);

    expect(storedCategory(CATEGORY_SLUG)?.isPublished).toBe(false);
    // The machine's own flag is still true: only the category rule hides it.
    expect(storedMachine(MACHINE_SLUG)?.isPublished).toBe(true);
    await expectPublicMissing(
      request,
      `/en/categories/${CATEGORY_SLUG}`,
      CATEGORY_NAME
    );
    await expectPublicMissing(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );
    expect((await bodyOf(request, '/en/machines')).html).not.toContain(
      MACHINE_NAME
    );

    await adminPage.goto(
      `${ADMIN_URL}/en/categories?status=awaiting-review&q=${encodeURIComponent(
        CATEGORY_NAME
      )}`
    );
    const awaitingCategory = row(adminPage, CATEGORY_NAME);
    await expect(awaitingCategory).toBeVisible();
    await expect(awaitingCategory).toContainText('Draft');
    await expect(awaitingCategory).toContainText('Created by editor');

    // ---- Admin republishes the category: the machine is visible again ----
    await adminPage.goto(`${ADMIN_URL}/en/categories/${categoryId}/edit`);
    await waitForHydration(adminPage);
    await expect(adminPage.locator('#category-published')).not.toBeChecked();
    await adminPage.locator('label[for="category-published"]').click();
    await adminPage.getByRole('button', { name: 'Save changes' }).click();
    await expect(adminPage).toHaveURL(`${ADMIN_URL}/en/categories`);
    expect(storedCategory(CATEGORY_SLUG)?.isPublished).toBe(true);
    await expectPublicVisible(
      request,
      `/en/categories/${CATEGORY_SLUG}`,
      CATEGORY_NAME
    );
    await expectPublicVisible(
      request,
      `/en/machines/${MACHINE_SLUG}`,
      MACHINE_NAME
    );

    // Seeded content is still exactly as visible as it was at the start.
    await expectPublicVisible(
      request,
      '/en/machines/colina-pro-1000',
      'Colina Pro 1000'
    );
    await expectPublicVisible(
      request,
      '/en/categories/packaging-machines',
      'Packaging'
    );

    await editorAfterPublish.close();
    await admin.close();
  });
});
