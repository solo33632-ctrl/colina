import { test, expect, type Browser } from '@playwright/test';
import type { StorageState } from '@playwright/test';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import { createAgents, deleteAgentsByTag } from './db-fixture';

// Stage 37b: the redesigned admin agents list + form.
//
// The Agent model now carries name/website/logo/isPublished (additive
// migration), and the admin list mirrors the other redesigned lists. This
// spec exercises the real flows: create through the form, schema rejection
// of a bad website URL, adopting a legacy nameless row, the publish/hide
// switch, search + country + status filters, the confirm-guarded delete, the
// Arabic list, and the 390px card layout.
//
// The tag rides inside BOTH country names (the only identifying text a row
// created against this table is guaranteed to carry is its country pair) and
// `deleteAgentsByTag` removes exactly this file's rows.
//
// Every test starts from the SAME four fixtures (beforeEach re-creates
// them): a run is one deterministic picture, not a chain of earlier tests'
// leftovers — a mid-run row mutating in one test cannot blind the next.
// The form-created rows also carry the tag in their country pair, so the
// afterAll sweep removes them too.
const TAG = 'st28a-admin';

const NAME_A = 'Port office';
const NAME_A_AR = 'مكتب الميناء';
const NAME_B = 'Nile office';
const NAME_B_AR = 'مكتب النيل';
const NAME_D = 'Hidden office';
const NAME_D_AR = 'مكتب مخفي';
const NAME_F1 = 'Form created agent';
const NAME_F2 = 'Rejected site agent';
const NAME_C_RENAMED = 'Renamed legacy agent';
const NAME_C_RENAMED_AR = 'وكيل الأقصر';

const COUNTRY_A = `Egypt ${TAG}`;
const COUNTRY_A_AR = `مصر ${TAG}`;
const COUNTRY_C = `Luxor ${TAG}`;
const COUNTRY_C_AR = `الأقصر ${TAG}`;
const COUNTRY_D = `Qena ${TAG}`;
const COUNTRY_D_AR = `قنا ${TAG}`;

const WEB_ERROR =
  'Website must be an absolute http(s) URL without embedded credentials.';

// A + B + D are normal rows, C is a row that predates the name columns and
// must still be listed. City names are unique so row-scoped locators stay
// unambiguous in both scripts.
const FIXTURE_AGENTS = [
  {
    countryEn: COUNTRY_A,
    countryAr: COUNTRY_A_AR,
    nameEn: NAME_A,
    nameAr: NAME_A_AR,
    cityEn: 'Alexandria',
    cityAr: 'الإسكندرية',
    phone: '+20 3 480 0101',
    email: 'port.st28a-admin@example.com',
    isPublished: true,
  },
  {
    countryEn: COUNTRY_A,
    countryAr: COUNTRY_A_AR,
    nameEn: NAME_B,
    nameAr: NAME_B_AR,
    cityEn: 'Aswan',
    cityAr: 'أسوان',
    websiteUrl: 'https://nile.example.com',
    isPublished: true,
  },
  {
    // The legacy row: no names at all. It must stay listed (the form asks
    // for a name the next time it is edited) — the country is all it has,
    // which is what the row headline falls back to.
    countryEn: COUNTRY_C,
    countryAr: COUNTRY_C_AR,
    isPublished: true,
  },
  {
    countryEn: COUNTRY_D,
    countryAr: COUNTRY_D_AR,
    nameEn: NAME_D,
    nameAr: NAME_D_AR,
    isPublished: false,
  },
];

// The login POST is rate-limited per IP (10 per 15 minutes), so this file
// must spend ONE sign-in, not one per test. `loginState` memoises per
// module instance, but the runner can reload the file between tests, so the
// state is also written to a temp file and re-read there — the same state
// then serves every test's fresh context (and both locales: the session is
// not locale-scoped).
const SESSION_DIR = join(tmpdir(), `colina-admin-agents-${process.pid}`);
const SESSION_FILE = join(SESSION_DIR, 'state.json');
let sessionState: StorageState | null = null;

// One sign-in per run. A stale state (a server restarted mid-run) re-signs
// in at most once more — the limiter allows 10 attempts per window.
async function ensureSession(browser: Browser) {
  if (sessionState) {
    return sessionState;
  }
  if (existsSync(SESSION_FILE)) {
    sessionState = JSON.parse(readFileSync(SESSION_FILE, 'utf8')) as StorageState;
    return sessionState;
  }
  sessionState = await loginState(
    browser,
    copyFor('en'),
    ADMIN_EMAIL,
    ADMIN_PASSWORD
  );
  mkdirSync(SESSION_DIR, { recursive: true });
  writeFileSync(SESSION_FILE, JSON.stringify(sessionState));
  return sessionState;
}

test.describe('admin agents list and form', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  function resetFixtures() {
    // A crashed previous run must not leak rows into this one.
    deleteAgentsByTag(TAG);
    createAgents(FIXTURE_AGENTS);
  }

  test.beforeAll(async ({ browser }) => {
    await ensureSession(browser);
  });

  // Every test sees the same four fixtures, whatever the tests before it
  // did: a per-test reset makes the spec a fixed picture instead of an
  // ordering-effect chain.
  test.beforeEach(() => {
    resetFixtures();
  });

  test.afterAll(() => {
    deleteAgentsByTag(TAG);
    rmSync(SESSION_DIR, { recursive: true, force: true });
  });

  // A fresh context per test from the shared session state.
  async function signedInPage(browser: Browser, locale: 'en' | 'ar') {
    const state = await ensureSession(browser);
    const context = await browser.newContext({
      storageState: state,
      viewport: { width: 1280, height: 900 },
    });
    return { context, page: await context.newPage() };
  }

  const tableRows = (page: import('@playwright/test').Page) =>
    page.getByRole('table', { name: 'Agents' }).locator('tbody tr');

  // The form redirects to the list with `?saved=1`, but the SaveBanner
  // CONSUMES that marker from the URL on mount, so the URL is not the
  // contract — the banner itself is (it ships in the server-rendered
  // payload and stays for a few seconds).
  async function expectSaved(page: import('@playwright/test').Page) {
    await expect(page.getByRole('status')).toContainText('Saved successfully.');
  }

  test('creates an agent through the form and shows it published', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents/new`);

    await page.getByLabel('Agent name (English)').fill(NAME_F1);
    await page.getByLabel('Agent name (Arabic)').fill('وكيل النموذج');
    await page.getByLabel('Country (English)').fill(`Form ${TAG}`);
    await page.getByLabel('Country (Arabic)').fill(`نموذج ${TAG}`);
    await page.getByLabel('City (English, optional)').fill('Zagazig');
    await page.getByLabel('City (Arabic, optional)').fill('الزقازيق');
    await page
      .getByLabel('Website (optional)')
      .fill('https://form-agent.example.com');
    await page.getByLabel('Phone (optional)').fill('+20 55 010 0203');

    await page.getByRole('button', { name: 'Create agent' }).click();

    // Landed on the list, banner up, and the new agent sits in the table
    // with the published badge (a create defaults to published).
    await expect(page).toHaveURL(/\/en\/agents\b/);
    await expectSaved(page);
    const row = tableRows(page).filter({ hasText: NAME_F1 });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText(`Form ${TAG}`);
    await expect(row).toContainText('Zagazig');
    await expect(row).toContainText('Published');
    await context.close();
  });

  test('rejects a website that is not an absolute http(s) URL, then accepts the fix', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents/new`);

    await page.getByLabel('Agent name (English)').fill(NAME_F2);
    await page.getByLabel('Agent name (Arabic)').fill('وكيل مرفوض');
    await page.getByLabel('Country (English)').fill(`Reject ${TAG}`);
    await page.getByLabel('Country (Arabic)').fill(`رفض ${TAG}`);
    // The form is a client-side schema: the submit never leaves the page and
    // the field's own error explains the rule.
    await page.getByLabel('Website (optional)').fill('javascript:alert(1)');
    await page.getByRole('button', { name: 'Create agent' }).click();

    await expect(page).toHaveURL(/\/en\/agents\/new/);
    await expect(
      page.getByRole('alert').filter({ hasText: WEB_ERROR })
    ).toHaveCount(1);

    // The fix saves: the same form, one valid URL.
    await page
      .getByLabel('Website (optional)')
      .fill('https://site.example.com');
    await page.getByRole('button', { name: 'Create agent' }).click();

    await expect(page).toHaveURL(/\/en\/agents\b/);
    await expectSaved(page);
    await expect(tableRows(page).filter({ hasText: NAME_F2 })).toHaveCount(1);
    await context.close();
  });

  test('adopts a legacy nameless row: the form asks for the name', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents`);

    // The nameless row is still listed, headlined by its country, with the
    // visible hint that the name is what it lacks.
    const legacy = tableRows(page).filter({ hasText: COUNTRY_C });
    await expect(legacy).toHaveCount(1);
    await expect(legacy).toContainText('Name missing');

    // The form starts the names empty and the schema enforces them: saving
    // without names fails and stays on the edit page.
    await legacy.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(/\/en\/agents\/.+\/edit/);
    await expect(page.getByLabel('Agent name (English)')).toHaveValue('');
    await expect(page.getByLabel('Agent name (Arabic)')).toHaveValue('');

    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page).toHaveURL(/\/en\/agents\/.+\/edit/);
    await expect(
      page
        .getByRole('alert')
        .filter({
          hasText:
            'English agent name must be at least 2 and at most 120 characters.',
        })
    ).toHaveCount(1);

    // Named (both languages), it saves and the list headlines the name.
    await page.getByLabel('Agent name (English)').fill(NAME_C_RENAMED);
    await page.getByLabel('Agent name (Arabic)').fill(NAME_C_RENAMED_AR);
    await page.getByRole('button', { name: 'Save changes' }).click();

    await expect(page).toHaveURL(/\/en\/agents\b/);
    await expectSaved(page);
    const renamed = tableRows(page).filter({ hasText: NAME_C_RENAMED });
    await expect(renamed).toHaveCount(1);
    // This row no longer lacks a name. (The seeded agents are nameless by
    // design and keep their hint — only this row was renamed.)
    await expect(renamed).not.toContainText('Name missing');
    await context.close();
  });

  test('hide and show from the list flip the status badge', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents`);

    const row = tableRows(page).filter({ hasText: NAME_A });
    await expect(row).toHaveCount(1);
    await expect(row).toContainText('Published');

    // The visible label names the action it will perform; the accessible
    // name also carries the agent, so it is unambiguous inside the list.
    await row.getByRole('button', { name: `Hide ${NAME_A}` }).click();
    await expect(row).toContainText('Hidden');

    await row.getByRole('button', { name: `Publish ${NAME_A}` }).click();
    await expect(row).toContainText('Published');
    // Left as it started: published.
    await expect(row.getByRole('button', { name: `Hide ${NAME_A}` })).toHaveCount(
      1
    );
    await context.close();
  });

  test('search reaches the city and the phone, not just the name', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');

    await page.goto(`${ADMIN_URL}/en/agents?q=Aswan`);
    await expect(tableRows(page).filter({ hasText: NAME_B })).toHaveCount(1);
    await expect(tableRows(page)).toHaveCount(1);

    // A phone fragment finds its row even though no name or country says it.
    await page.goto(`${ADMIN_URL}/en/agents?q=3%20480`);
    await expect(tableRows(page).filter({ hasText: NAME_A })).toHaveCount(1);
    await expect(tableRows(page)).toHaveCount(1);
    await context.close();
  });

  test('the country filter narrows to one country pair', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents`);

    await page.getByLabel('Filter by country').selectOption(COUNTRY_A);
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(page).toHaveURL(/\/en\/agents\?.*country=/);
    await expect(tableRows(page).filter({ hasText: NAME_A })).toHaveCount(1);
    await expect(tableRows(page).filter({ hasText: NAME_B })).toHaveCount(1);
    await expect(tableRows(page)).toHaveCount(2);
    await context.close();
  });

  test('the status filter separates published from hidden rows', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents`);

    await page
      .getByLabel('Filter by status', { exact: true })
      .selectOption('hidden');
    await page.getByRole('button', { name: 'Search' }).click();

    // Exactly the one hidden fixture, and nothing published anywhere.
    await expect(tableRows(page)).toHaveCount(1);
    const hiddenRow = tableRows(page).filter({ hasText: NAME_D });
    await expect(hiddenRow).toHaveCount(1);
    await expect(hiddenRow).toContainText('Hidden');

    // Published side: the three published fixtures plus the two nameless
    // seeded agents (published by default), not the hidden one.
    await page
      .getByLabel('Filter by status', { exact: true })
      .selectOption('published');
    await page.getByRole('button', { name: 'Search' }).click();

    await expect(tableRows(page).filter({ hasText: NAME_D })).toHaveCount(0);
    await expect(tableRows(page).filter({ hasText: NAME_A })).toHaveCount(1);
    await expect(tableRows(page).filter({ hasText: NAME_B })).toHaveCount(1);
    await expect(tableRows(page).filter({ hasText: COUNTRY_C })).toHaveCount(1);
    await expect(tableRows(page).filter({ hasText: 'Egypt · Cairo' })).toHaveCount(
      1
    );
    await expect(
      tableRows(page).filter({ hasText: 'Saudi Arabia · Riyadh' })
    ).toHaveCount(1);
    await expect(tableRows(page)).toHaveCount(5);
    await context.close();
  });

  test('delete asks a confirm dialog naming the agent', async ({ browser }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.goto(`${ADMIN_URL}/en/agents`);

    const row = tableRows(page).filter({ hasText: NAME_A });
    await expect(row).toHaveCount(1);
    await row.getByRole('button', { name: `Delete ${NAME_A}` }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toContainText(
      `Delete “${NAME_A}”? This cannot be undone.`
    );

    // Confirm is the dialog's own Delete button, distinct from the row
    // buttons by being inside the dialog.
    await dialog.getByRole('button', { name: 'Delete', exact: true }).click();

    await expect(tableRows(page).filter({ hasText: NAME_A })).toHaveCount(0);
    await expect(page.getByRole('table', { name: 'Agents' })).not.toContainText(
      NAME_A
    );
    await context.close();
  });

  test('the Arabic list reads rtl with Arabic names, badges and actions', async ({
    browser,
  }) => {
    const { context, page } = await signedInPage(browser, 'ar');
    await page.goto(`${ADMIN_URL}/ar/agents`);

    // The layout sets lang and dir on <html>.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const table = page.getByRole('table', { name: 'الوكلاء' });
    const rowA = table.locator('tbody tr').filter({ hasText: NAME_A_AR });
    await expect(rowA).toHaveCount(1);
    await expect(rowA).toContainText(COUNTRY_A_AR);
    await expect(rowA).toContainText('الإسكندرية');
    await expect(rowA).toContainText('منشور');
    // The accessible publish/hide names follow the row's state.
    await expect(
      rowA.getByRole('button', { name: `إخفاء ${NAME_A_AR}` })
    ).toHaveCount(1);

    const rowD = table.locator('tbody tr').filter({ hasText: NAME_D_AR });
    await expect(rowD).toHaveCount(1);
    await expect(rowD).toContainText('مخفي');
    await expect(
      rowD.getByRole('button', { name: `إظهار ${NAME_D_AR}` })
    ).toHaveCount(1);

    // The legacy row headlines its country with the missing-name hint.
    const legacy = table.locator('tbody tr').filter({ hasText: COUNTRY_C_AR });
    await expect(legacy).toHaveCount(1);
    await expect(legacy).toContainText('الاسم مفقود');
    await context.close();
  });

  test('the list stays inside a 390px viewport (en)', async ({ browser }) => {
    const { context, page } = await signedInPage(browser, 'en');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ADMIN_URL}/en/agents`);

    // Cards replace the table below md; content may not widen the document.
    await expect(page.locator('ul[aria-label="Agents"]')).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    await context.close();
  });

  test('the list stays inside a 390px viewport (ar)', async ({ browser }) => {
    const { context, page } = await signedInPage(browser, 'ar');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${ADMIN_URL}/ar/agents`);

    await expect(page.locator('ul[aria-label="الوكلاء"]')).toBeVisible();
    const widths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    await context.close();
  });
});
