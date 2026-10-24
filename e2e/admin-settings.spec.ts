import { test, expect, type Browser } from '@playwright/test';
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
  ensureEditor,
  removeEditor,
} from './admin-editor';
import { runInDb, runInDbValue } from './db-fixture';

const en = copyFor('en');

const NUMBER_INPUT = '#settings-whatsapp-number';
const PREVIEW = '[data-testid="whatsapp-preview"]';

const COPY = {
  heading: 'Site settings',
  whatsapp: 'WhatsApp',
  save: 'Save settings',
  saved: 'Saved successfully.',
  numberHint:
    'Enter the number with the country code. Leave empty to hide the WhatsApp button on the website.',
  leadingZero: 'Start with the country code, not 0. Example: +20 100 123 4567.',
  messageEn: 'Default message (English)',
  messageAr: 'Default message (Arabic)',
} as const;

type SettingsRow = {
  whatsappNumber: string | null;
  whatsappMessageEn: string | null;
  whatsappMessageAr: string | null;
};

function deleteSettings() {
  runInDb(`
    await prisma.siteSettings.deleteMany({ where: { id: 'main' } });
  `);
}

function readSettings(): SettingsRow | null {
  return runInDbValue<SettingsRow | null>(`
    return await prisma.siteSettings.findUnique({
      where: { id: 'main' },
      select: {
        whatsappNumber: true,
        whatsappMessageEn: true,
        whatsappMessageAr: true,
      },
    });
  `);
}

function countSettingsAudit(): number {
  return (
    runInDbValue<number>(`
      return await prisma.auditLog.count({
        where: { action: 'SETTINGS_UPDATE', entity: 'SiteSettings:main' },
      });
    `) ?? 0
  );
}

function seedSettings() {
  runInDb(`
    await prisma.siteSettings.create({
      data: {
        id: 'main',
        whatsappNumber: '201001234567',
        whatsappMessageEn: 'Old English greeting',
        whatsappMessageAr: 'تحية عربية قديمة',
      },
    });
  `);
}

async function openSettings(browser: Browser) {
  const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
  const context = await browser.newContext({ storageState: state });
  const page = await context.newPage();
  await page.goto(`${ADMIN_URL}/en`);
  // Reachable from the sidebar, not only by typing the URL.
  await page.getByRole('link', { name: COPY.heading }).click();
  await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);
  return { context, page };
}

test.describe('site settings', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
  test.skip(
    !DATABASE_URL,
    'DATABASE_URL is required to read and clean SiteSettings'
  );

  test.beforeAll(() => {
    // A throwaway editor for the role-gate test. The fixture is shared with
    // the audit-log and insights specs (see admin-editor.ts).
    if (DATABASE_URL) {
      ensureEditor();
    }
  });

  // Each test starts without a row, so the "nothing is saved" assertion in the
  // invalid-number test cannot pass because of an earlier test's row.
  test.beforeEach(() => {
    if (DATABASE_URL) {
      deleteSettings();
    }
  });

  test.afterAll(() => {
    if (DATABASE_URL) {
      deleteSettings();
      removeEditor();
    }
  });

  test('saves the normalized number, shows the preview and the saved banner, and round-trips both greetings', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);

    await expect(
      page.getByRole('heading', { name: COPY.heading, level: 1 })
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: COPY.whatsapp, level: 2 })
    ).toBeVisible();
    await expect(page.getByText(COPY.numberHint)).toBeVisible();

    const number = page.locator(NUMBER_INPUT);
    await expect(number).toHaveAttribute('dir', 'ltr');
    await expect(number).toHaveAttribute('inputmode', 'tel');
    await expect(number).toHaveAttribute('autocomplete', 'off');
    await expect(number).toHaveAttribute('placeholder', '+20 100 123 4567');

    // Live preview from the normalized value, before saving.
    await number.fill('+20 100 123 4567');
    const preview = page.getByTestId('whatsapp-preview');
    await expect(preview).toHaveText('https://wa.me/201001234567');
    await expect(preview).toHaveAttribute('href', 'https://wa.me/201001234567');

    await page.getByLabel(COPY.messageEn).fill('Hello from Colina');
    await page.getByLabel(COPY.messageAr).fill('مرحباً من كولينا');

    const auditBefore = countSettingsAudit();
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();
    await expect(page).not.toHaveURL(/saved=1/);
    await expect(preview).toHaveText('https://wa.me/201001234567');

    // The raw "+20 ..." is never what lands in the database.
    expect(readSettings()).toEqual({
      whatsappNumber: '201001234567',
      whatsappMessageEn: 'Hello from Colina',
      whatsappMessageAr: 'مرحباً من كولينا',
    });
    expect(countSettingsAudit()).toBe(auditBefore + 1);

    // A full reload proves the page reads the saved row, not just the form's
    // in-memory state.
    await page.reload();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('201001234567');
    await expect(page.getByTestId('whatsapp-preview')).toHaveText(
      'https://wa.me/201001234567'
    );
    await expect(page.getByLabel(COPY.messageEn)).toHaveValue(
      'Hello from Colina'
    );
    await expect(page.getByLabel(COPY.messageAr)).toHaveValue(
      'مرحباً من كولينا'
    );

    await context.close();
  });

  test('refuses a leading zero with the clearer message and saves nothing', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);

    await page.locator(NUMBER_INPUT).fill('01001234567');
    // No link is built from an invalid number.
    await expect(page.getByTestId('whatsapp-preview')).toHaveCount(0);

    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.leadingZero)).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);

    // The client refused the submit, so the action never ran.
    expect(readSettings()).toBeNull();

    await context.close();
  });

  test('clearing the number stores null and both greetings round-trip', async ({
    browser,
  }) => {
    seedSettings();
    const { context, page } = await openSettings(browser);

    const number = page.locator(NUMBER_INPUT);
    await expect(number).toHaveValue('201001234567');
    await expect(page.getByTestId('whatsapp-preview')).toHaveText(
      'https://wa.me/201001234567'
    );

    // Empty is a valid save: it is how the public button is hidden.
    await number.fill('');
    await expect(page.getByTestId('whatsapp-preview')).toHaveCount(0);
    await page.getByLabel(COPY.messageEn).fill('New English greeting');
    await page.getByLabel(COPY.messageAr).fill('تحية عربية جديدة');

    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: 'New English greeting',
      whatsappMessageAr: 'تحية عربية جديدة',
    });

    await page.reload();
    await expect(page.locator(NUMBER_INPUT)).toHaveValue('');
    await expect(page.getByTestId('whatsapp-preview')).toHaveCount(0);
    await expect(page.getByLabel(COPY.messageEn)).toHaveValue(
      'New English greeting'
    );
    await expect(page.getByLabel(COPY.messageAr)).toHaveValue(
      'تحية عربية جديدة'
    );

    await context.close();
  });

  test('an editor has no sidebar entry and is refused by the page', async ({
    browser,
  }) => {
    const editorState = await loginState(
      browser,
      en,
      EDITOR.email,
      EDITOR.password
    );
    const context = await browser.newContext({ storageState: editorState });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en`);
    await expect(page.locator('aside nav').first()).not.toContainText(
      COPY.heading
    );

    // A direct request gets the explanatory card, not a bare 403 — the same
    // behaviour as the audit log and insights gates.
    const response = await page.goto(`${ADMIN_URL}/en/settings`);
    expect(response?.status()).toBe(200);
    await expect(page.getByText('Not authorized')).toBeVisible();
    await expect(page.locator(NUMBER_INPUT)).toHaveCount(0);

    await context.close();
  });
});
