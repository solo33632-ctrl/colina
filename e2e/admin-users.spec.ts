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
import { DATABASE_URL, storedCategory, storedMachine } from './admin-editor';
import { resetRateLimitBuckets } from './db-fixture';
import {
  GATE_EDITOR,
  SCENARIO_A,
  SCENARIO_B,
  SCENARIO_C,
  SECOND_SUPER,
  UI_EDITOR,
  accountByEmail,
  actorAuditRows,
  auditCountForActor,
  cleanupUserFixtures,
  ensureFixtureAccounts,
  seedScenarioContent,
  userDeleteAudit,
} from './admin-users-fixture';

// Stage 4b: the users area, the per-user activity page and the three deletion
// choices. The UI drives what an admin/editor really does; the Server Action
// wire calls prove the guards that a hidden button alone would not prove
// (self/last-admin protection, editor denied user actions).
//
// Every fixture carries `st4b` in its email/slug, and cleanup removes exactly
// those rows.

const en = copyFor('en');

const ACTION_FILES = {
  createEditor: 'lib/actions/users.ts',
  resetEditorPassword: 'lib/actions/users.ts',
  deleteAdminUser: 'lib/actions/users.ts',
} as const;

type UserActionName = keyof typeof ACTION_FILES;

/**
 * A Server Action is only invokable from a page whose module graph references
 * it (the same rule the Stage 4a wire tests follow). `createEditor` belongs to
 * the new-user form; the other two belong to the list.
 */
const ACTION_URLS: Record<UserActionName, string> = {
  createEditor: '/en/users/new',
  resetEditorPassword: '/en/users',
  deleteAdminUser: '/en/users',
};

/** Server Action id from the dev (or built) reference manifest. */
function actionId(exportedName: UserActionName): string {
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
      // No manifest here: try the next location.
    }
  }
  throw new Error(`no Server Action id for ${exportedName}`);
}

type WireResult = { status: number; text: string };

async function callUserAction(
  page: Page,
  exportedName: UserActionName,
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
    {
      action: actionId(exportedName),
      url: `${ADMIN_URL}${ACTION_URLS[exportedName]}`,
      args,
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

/** A table row whose cell text is exactly `text`. */
function row(page: Page, text: string) {
  return page
    .locator('tr')
    .filter({ has: page.getByText(text, { exact: true }) });
}

async function asAdmin(browser: Browser) {
  const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
  const context = await browser.newContext({ storageState: state });
  return { context, page: await context.newPage() };
}

test.describe.serial('admin accounts, activity and deletion', () => {
  let adminId = '';
  let uiEditorId = '';
  let aMachineId = '';

  test.beforeAll(() => {
    test.skip(!DATABASE_URL, 'DATABASE_URL is required for user fixtures');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

    cleanupUserFixtures();
    ensureFixtureAccounts();
    adminId = accountByEmail(ADMIN_EMAIL)?.id ?? '';
    expect(adminId, 'seeded admin row').not.toBe('');
    seedScenarioContent(adminId);
    aMachineId = storedMachine('st4b-a-machine')?.id ?? '';
    expect(aMachineId, 'scenario A machine row').not.toBe('');
    // Several logins below are fresh by design (old/new password, a deleted
    // account, a gate editor). The durable limiter is shared per IP, so start
    // this spec from an empty budget.
    resetRateLimitBuckets();
  });

  test.afterAll(() => {
    cleanupUserFixtures();
  });

  test('admin creates an editor through the users area', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await expect(
      page.getByRole('heading', { name: 'Admin accounts' })
    ).toBeVisible();

    // The acting account is also the last full admin: it gets activity only.
    const selfRow = row(page, ADMIN_EMAIL);
    await expect(selfRow.getByRole('link', { name: 'Activity' })).toBeVisible();
    await expect(
      selfRow.getByRole('button', { name: /Delete account|Delete —/ })
    ).toHaveCount(0);
    await expect(
      selfRow.getByRole('button', { name: /Reset password/ })
    ).toHaveCount(0);

    await page.getByRole('link', { name: 'Create editor' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/users/new`);

    await page.getByLabel('Name').fill(UI_EDITOR.name);
    await page.getByLabel('Email').fill(UI_EDITOR.email);
    await page.getByLabel('Initial password').fill(UI_EDITOR.password);
    await page.getByRole('button', { name: 'Create editor' }).click();

    // The SaveBanner consumes `?saved=1` on mount (see the agents spec), so
    // the banner is the contract, not the raw URL.
    await expect(page.getByText('Editor account created.')).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/users`);
    await expect(row(page, UI_EDITOR.email)).toBeVisible();
    await expect(
      row(page, UI_EDITOR.email).getByText('Editor', { exact: true })
    ).toBeVisible();

    const created = accountByEmail(UI_EDITOR.email);
    expect(created).toMatchObject({
      name: UI_EDITOR.name,
      email: UI_EDITOR.email,
      role: 'EDITOR',
    });
    uiEditorId = created?.id ?? '';
    expect(uiEditorId).not.toBe('');

    await context.close();
  });

  test('editor signs in and creates a category and a machine', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      en,
      UI_EDITOR.email,
      UI_EDITOR.password,
      { fresh: true }
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await page.getByLabel('Name (English)').fill('E2E 4b UI category');
    await page.getByLabel('Name (Arabic)').fill('فئة واجهة 4ب');
    await page.getByLabel('Slug').fill('st4b-ui-cat');
    await page
      .getByLabel('Description (English)')
      .fill('Category created by the Stage 4b editor.');
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
    await expect(row(page, 'E2E 4b UI category')).toBeVisible();

    await page.goto(`${ADMIN_URL}/en/machines/new`);
    await page.getByLabel('Name (English)').fill('E2E 4b UI machine');
    await page.getByLabel('Name (Arabic)').fill('آلة واجهة 4ب');
    await page.getByLabel('Slug').fill('st4b-ui-machine');
    await page
      .getByLabel('Category')
      .selectOption({ label: 'E2E 4b UI category' });
    await page
      .getByLabel('Short description (English)')
      .fill('Short description written by the Stage 4b editor.');
    await page
      .getByLabel('Short description (Arabic)')
      .fill('وصف قصير كتبه محرر المرحلة 4ب.');
    await page.getByRole('button', { name: 'Create machine' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
    await expect(row(page, 'E2E 4b UI machine')).toBeVisible();

    expect(storedCategory('st4b-ui-cat')).toMatchObject({
      createdById: uiEditorId,
    });
    expect(storedMachine('st4b-ui-machine')).toMatchObject({
      createdById: uiEditorId,
    });

    await context.close();
  });

  test('admin sees the editor actions on the per-user page', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users/${uiEditorId}`);
    await expect(
      page.getByText(UI_EDITOR.email, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(`Created category E2E 4b UI category`, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText(`Created machine E2E 4b UI machine`, { exact: true })
    ).toBeVisible();

    const activity = page.getByTestId('user-activity-entry');
    await expect(activity).toHaveCount(2);
    await expect(page.getByRole('link', { name: 'View' })).toHaveCount(2);
    await expect(page.getByText('No longer exists')).toHaveCount(0);

    await context.close();
  });

  test('admin resets the editor password: old password and old session die', async ({
    browser,
  }) => {
    // A real session minted before the reset. `fresh` ignores any state file
    // an earlier run left behind: the fixture account is recreated each run.
    const oldState = await loginState(
      browser,
      en,
      UI_EDITOR.email,
      UI_EDITOR.password,
      { fresh: true }
    );
    const staleContext = await browser.newContext({ storageState: oldState });
    const stalePage = await staleContext.newPage();
    await stalePage.goto(`${ADMIN_URL}/en/machines`);
    await expect(stalePage).toHaveURL(`${ADMIN_URL}/en/machines`);

    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await row(page, UI_EDITOR.email)
      .getByRole('button', {
        name: `Reset password — ${UI_EDITOR.email}`,
      })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('New password').fill(UI_EDITOR.newPassword);
    await dialog.getByRole('button', { name: 'Reset password' }).click();
    await expect(
      dialog.getByText('Password reset. Existing sessions were signed out.')
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await context.close();

    // The token created before the reset must be rejected now.
    await stalePage.goto(`${ADMIN_URL}/en/machines`);
    await expect(stalePage).toHaveURL(/\/en\/login/);
    await staleContext.close();

    // The old password fails; the new one works.
    const loginContext = await browser.newContext();
    const loginPage = await loginContext.newPage();
    await loginPage.goto(`${ADMIN_URL}/en/login`);
    await loginPage.getByLabel('Email').fill(UI_EDITOR.email);
    await loginPage.getByLabel('Password').fill(UI_EDITOR.password);
    await loginPage.getByRole('button', { name: 'Log in' }).click();
    await expect(loginPage.getByText(en.invalid)).toBeVisible();

    await loginPage.getByLabel('Password').fill(UI_EDITOR.newPassword);
    await loginPage.getByRole('button', { name: 'Log in' }).click();
    await expect(loginPage).toHaveURL(`${ADMIN_URL}/en/machines`);
    await loginContext.close();
  });

  test('editor cannot open the users area or call its actions', async ({
    browser,
  }) => {
    const state = await loginState(
      browser,
      en,
      GATE_EDITOR.email,
      GATE_EDITOR.password,
      { fresh: true }
    );
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/users`);
    await expect(page.getByText('Not authorized')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Admin accounts' })
    ).toHaveCount(0);

    await page.goto(`${ADMIN_URL}/en/users/new`);
    await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);

    await page.goto(`${ADMIN_URL}/en/machines`);
    for (const name of [
      'createEditor',
      'resetEditorPassword',
      'deleteAdminUser',
    ] as const) {
      const result = await callUserAction(page, name, [
        {
          id: SCENARIO_A.id,
          name: 'Wire Editor',
          email: 'wire-editor@example.com',
          password: 'wire-editor-password-1234',
          mode: 'account',
          deleteContent: false,
          confirmEmail: '',
        },
      ]);
      expectRefused(result, 'unauthorized');
    }

    expect(accountByEmail(SCENARIO_A.email)?.id).toBe(SCENARIO_A.id);
    expect(accountByEmail('wire-editor@example.com')).toBeNull();

    await context.close();
  });

  test('a wrong typed email blocks the account+activity deletion', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await row(page, SCENARIO_B.email)
      .getByRole('button', {
        name: `Delete — ${SCENARIO_B.email}`,
      })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('radio', {
        name: /Delete the account and its activity log entries/,
      })
      .check();
    await dialog
      .getByLabel(`Type ${SCENARIO_B.email} to confirm.`)
      .fill('wrong@example.com');
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    await expect(
      dialog.getByText('The email you typed does not match this account.')
    ).toBeVisible();

    expect(accountByEmail(SCENARIO_B.email)?.id).toBe(SCENARIO_B.id);
    expect(auditCountForActor(SCENARIO_B.email)).toBe(2);

    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await context.close();
  });

  test('mode A keeps the audit history and the account content', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await row(page, SCENARIO_A.email)
      .getByRole('button', {
        name: `Delete — ${SCENARIO_A.email}`,
      })
      .click();

    const dialog = page.getByRole('dialog');
    // Mode A is the default and needs no typed email.
    await expect(
      dialog.getByLabel(`Type ${SCENARIO_A.email} to confirm.`)
    ).toHaveCount(0);
    await dialog.getByRole('button', { name: 'Delete account' }).click();
    await expect(
      dialog.getByRole('heading', { name: 'Account deleted' })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        '0 audit entries removed, 0 machines deleted, 0 categories deleted.'
      )
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(row(page, SCENARIO_A.email)).toHaveCount(0);

    expect(accountByEmail(SCENARIO_A.email)).toBeNull();
    const machine = storedMachine('st4b-a-machine');
    expect(machine).toMatchObject({ id: aMachineId, createdById: null });
    expect(storedCategory('st4b-a-cat')).toMatchObject({ createdById: null });

    const orphaned = actorAuditRows(SCENARIO_A.email);
    expect(orphaned).toHaveLength(1);
    expect(orphaned[0]).toMatchObject({
      action: 'MACHINE_CREATE',
      entity: 'Machine:st4b-a-machine',
      adminUserId: null,
      actorEmail: SCENARIO_A.email,
    });

    const deletion = userDeleteAudit(SCENARIO_A.id);
    expect(deletion).toMatchObject({
      action: 'USER_DELETE',
      actorEmail: ADMIN_EMAIL,
      adminUserId: adminId,
    });
    expect(JSON.stringify(deletion?.details)).toContain('"account"');

    // The remaining row is reachable by its snapshot in the audit filter, with
    // the deleted-account marker.
    await page.goto(
      `${ADMIN_URL}/en/audit-log?admin=deleted:${encodeURIComponent(SCENARIO_A.email)}`
    );
    await expect(
      page.getByText(SCENARIO_A.email, { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('deleted account', { exact: true })
    ).toBeVisible();
    await expect(
      page.getByText('Created machine E2E 4b A machine', { exact: true })
    ).toBeVisible();

    // Its machine stays, owned by nobody, and the full admin can still edit it.
    await page.goto(`${ADMIN_URL}/en/machines/${aMachineId}/edit`);
    await expect(page.getByLabel('Name (English)')).toHaveValue(
      'E2E 4b A machine'
    );

    await context.close();
  });

  test('mode B removes the account and its audit rows, keeping content', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await row(page, SCENARIO_B.email)
      .getByRole('button', {
        name: `Delete — ${SCENARIO_B.email}`,
      })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('radio', {
        name: /Delete the account and its activity log entries/,
      })
      .check();
    await dialog
      .getByLabel(`Type ${SCENARIO_B.email} to confirm.`)
      .fill(SCENARIO_B.email);
    await dialog.getByRole('button', { name: 'Delete account' }).click();

    await expect(
      dialog.getByRole('heading', { name: 'Account deleted' })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        '2 audit entries removed, 0 machines deleted, 0 categories deleted.'
      )
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(row(page, SCENARIO_B.email)).toHaveCount(0);

    expect(accountByEmail(SCENARIO_B.email)).toBeNull();
    expect(auditCountForActor(SCENARIO_B.email)).toBe(0);

    // The deletion itself survives, written by the acting admin with counts.
    const deletion = userDeleteAudit(SCENARIO_B.id);
    expect(deletion).toMatchObject({
      action: 'USER_DELETE',
      actorEmail: ADMIN_EMAIL,
    });
    const details = deletion?.details as {
      changes?: { field: string; from: unknown }[];
    };
    const fields = Object.fromEntries(
      (details.changes ?? []).map((change) => [change.field, change.from])
    );
    expect(fields).toMatchObject({
      email: SCENARIO_B.email,
      mode: 'account_and_audit',
      auditRows: 2,
      machines: 0,
      categories: 0,
    });

    // Content stays, detached from the deleted account.
    expect(storedMachine('st4b-b-machine')).toMatchObject({
      createdById: null,
    });
    expect(storedCategory('st4b-b-cat')).toMatchObject({ createdById: null });

    await context.close();
  });

  test('mode B + content deletes owned content and reports a blocked category', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);
    await row(page, SCENARIO_C.email)
      .getByRole('button', {
        name: `Delete — ${SCENARIO_C.email}`,
      })
      .click();

    const dialog = page.getByRole('dialog');
    await dialog
      .getByRole('radio', {
        name: /Delete the account and its activity log entries/,
      })
      .check();
    await dialog
      .getByRole('checkbox', {
        name: /Also delete the machines and categories/,
      })
      .check();
    await dialog
      .getByLabel(`Type ${SCENARIO_C.email} to confirm.`)
      .fill(SCENARIO_C.email);
    await dialog.getByRole('button', { name: 'Delete account' }).click();

    await expect(
      dialog.getByRole('heading', { name: 'Account deleted' })
    ).toBeVisible();
    await expect(
      dialog.getByText(
        '2 audit entries removed, 1 machine deleted, 1 category deleted.'
      )
    ).toBeVisible();
    await expect(dialog.getByText('Categories kept:')).toBeVisible();
    await expect(
      dialog.getByText('E2E 4b C busy category', { exact: true })
    ).toBeVisible();
    await dialog.getByRole('button', { name: 'Close' }).click();
    await expect(row(page, SCENARIO_C.email)).toHaveCount(0);

    expect(accountByEmail(SCENARIO_C.email)).toBeNull();
    expect(auditCountForActor(SCENARIO_C.email)).toBe(0);
    expect(storedMachine('st4b-c-machine')).toBeNull();
    expect(storedCategory('st4b-c-own-cat')).toBeNull();

    // The busy category and its admin-owned machine are untouched.
    expect(storedCategory('st4b-c-busy-cat')).toMatchObject({
      nameEn: 'E2E 4b C busy category',
      createdById: null,
    });
    expect(storedMachine('st4b-c-admin-machine')).toMatchObject({
      createdById: adminId,
    });

    const deletion = userDeleteAudit(SCENARIO_C.id);
    const details = deletion?.details as {
      changes?: { field: string; from: unknown }[];
    };
    const fields = Object.fromEntries(
      (details?.changes ?? []).map((change) => [change.field, change.from])
    );
    expect(fields).toMatchObject({
      email: SCENARIO_C.email,
      mode: 'account_and_audit',
      auditRows: 2,
      machines: 1,
      categories: 1,
    });

    await context.close();
  });

  test('the action refuses self and another full admin', async ({
    browser,
  }) => {
    const { context, page } = await asAdmin(browser);

    await page.goto(`${ADMIN_URL}/en/users`);

    // The seeded admin is the acting account and the last full admin.
    const selfDelete = await callUserAction(page, 'deleteAdminUser', [
      {
        id: adminId,
        mode: 'account',
        deleteContent: false,
        confirmEmail: '',
      },
    ]);
    expectRefused(selfDelete, 'self');
    expect(accountByEmail(ADMIN_EMAIL)?.id).toBe(adminId);

    // A second full admin is still protected by the role rule.
    const superDelete = await callUserAction(page, 'deleteAdminUser', [
      {
        id: SECOND_SUPER.id,
        mode: 'account',
        deleteContent: false,
        confirmEmail: '',
      },
    ]);
    expectRefused(superDelete, 'protected_account');
    expect(accountByEmail(SECOND_SUPER.email)?.id).toBe(SECOND_SUPER.id);

    // And the UI never offers those buttons for a full admin.
    const superRow = row(page, SECOND_SUPER.email);
    await expect(
      superRow.getByRole('link', { name: 'Activity' })
    ).toBeVisible();
    await expect(
      superRow.getByRole('button', { name: /Delete account|Delete —/ })
    ).toHaveCount(0);
    await expect(
      superRow.getByRole('button', { name: /Reset password/ })
    ).toHaveCount(0);

    await context.close();
  });
});
