import { test, expect } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  LOCALES,
  copyFor,
  loginState,
} from './admin-session';

const DATABASE_URL = process.env.DATABASE_URL;

// The audit log is the project's only role gate (Phase 12): editors must be
// refused, and the refusal has to hold under both locale prefixes because
// the gate now lives inside a `[locale]` segment.
const EDITOR = {
  email: 'editor-e2e@example.com',
  password: 'editor-e2e-password-1234',
  id: 'e2e-editor',
};

// The editor is created straight in the database: the admin panel has no
// self-registration, so there is no UI path that would produce one.
function runInDb(script: string) {
  execFileSync('npx', ['tsx', '-e', script], {
    cwd: resolve(__dirname, '../packages/db'),
    env: { ...process.env, DATABASE_URL },
    stdio: 'pipe',
  });
}

function ensureEditor() {
  runInDb(`
    const argon2 = require('argon2');
    const { prisma } = require('@colina/db');
    (async () => {
      const hash = await argon2.hash(${JSON.stringify(EDITOR.password)}, { type: argon2.argon2id });
      await prisma.adminUser.upsert({
        where: { id: ${JSON.stringify(EDITOR.id)} },
        create: { id: ${JSON.stringify(EDITOR.id)}, email: ${JSON.stringify(EDITOR.email)}, passwordHash: hash, role: 'EDITOR' },
        update: { passwordHash: hash, role: 'EDITOR' },
      });
      await prisma.$disconnect();
    })().catch((e) => { console.error(e); process.exit(1); });
  `);
}

function removeEditor() {
  runInDb(`
    const { prisma } = require('@colina/db');
    (async () => {
      await prisma.adminUser.deleteMany({ where: { id: ${JSON.stringify(EDITOR.id)} } });
      await prisma.$disconnect();
    })().catch(() => process.exit(0));
  `);
}

test.describe('admin role gating', () => {
  test.beforeAll(() => {
    test.skip(!DATABASE_URL, 'DATABASE_URL is required to create the editor');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
    ensureEditor();
  });

  test.afterAll(() => {
    if (DATABASE_URL) {
      removeEditor();
    }
  });

  // A session cookie is not locale-scoped, so each role is signed in once
  // and the same session is then exercised under both locale prefixes. The
  // gate under test is the role check inside the page, not the login locale —
  // signing in per locale would only spend the login rate limit (10 attempts
  // per 15 minutes per IP) on the suite itself.
  const en = copyFor('en');

  test('the audit-log role gate holds under both locales', async ({
    browser,
  }) => {
    const editorState = await loginState(
      browser,
      en,
      EDITOR.email,
      EDITOR.password
    );
    const editorContext = await browser.newContext({
      storageState: editorState,
    });
    const editorPage = await editorContext.newPage();

    for (const locale of LOCALES) {
      // The nav link is hidden for an editor...
      await editorPage.goto(`${ADMIN_URL}/${locale.id}`);
      expect(
        await editorPage.locator('aside nav').first().textContent(),
        `/${locale.id}: audit link should be hidden for an editor`
      ).not.toContain(locale.audit);

      // ...and a direct request is refused with the explanatory card rather
      // than a bare 403 (the behaviour Phase 12 established).
      const res = await editorPage.goto(`${ADMIN_URL}/${locale.id}/audit-log`);
      expect(res?.status(), `/${locale.id}/audit-log`).toBe(200);
      await expect(editorPage.getByText(locale.denied)).toBeVisible();

      // An editor keeps full access to the content sections.
      await editorPage.goto(`${ADMIN_URL}/${locale.id}/categories`);
      await expect(editorPage.locator('h1')).toBeVisible();
    }
    await editorContext.close();
  });

  test('a super admin reaches the audit log under both locales', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      await page.goto(`${ADMIN_URL}/${locale.id}`);
      expect(
        await page.locator('aside nav').first().textContent(),
        `/${locale.id}: audit link should be visible for a super admin`
      ).toContain(locale.audit);

      await page.goto(`${ADMIN_URL}/${locale.id}/audit-log`);
      await expect(page.locator('h1')).toBeVisible();
      await expect(page.getByText(locale.denied)).toHaveCount(0);
    }
    await context.close();
  });
});
