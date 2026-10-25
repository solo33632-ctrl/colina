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

const PHONE = '#settings-contact-phone';
const EMAIL = '#settings-contact-email';
const NUMBER_INPUT = '#settings-whatsapp-number';
const PREVIEW = '[data-testid="whatsapp-preview"]';
const ADDRESS_EN = '#settings-factory-address-en';
const ADDRESS_AR = '#settings-factory-address-ar';
const HOURS_EN = '#settings-factory-hours-en';
const HOURS_AR = '#settings-factory-hours-ar';
const MAPS_URL = '#settings-factory-maps-url';
const COORDINATES_INPUT = '#settings-factory-coordinates';

const COPY = {
  heading: 'Site settings',
  contact: 'Contact info',
  whatsapp: 'WhatsApp',
  save: 'Save settings',
  saved: 'Saved successfully.',
  phoneHint:
    'Shown on the contact page. Write it the way visitors should read it.',
  numberHint:
    'Enter the number with the country code. Leave empty to hide the WhatsApp button on the website.',
  leadingZero: 'Start with the country code, not 0. Example: +20 100 123 4567.',
  messageEn: 'Default message (English)',
  messageAr: 'Default message (Arabic)',
  phoneError:
    'Enter a phone number using digits, spaces and + - ( ) . only, with at least 6 digits.',
  emailError: 'Enter a valid email address, for example info@yourcompany.com.',
  addressEn: 'Address (English)',
  addressAr: 'Address (Arabic)',
  hoursEn: 'Working hours (English)',
  hoursAr: 'Working hours (Arabic)',
  mapsUrl: 'Location link (optional)',
  mapsUrlHint:
    "Shown as an 'Open in maps' link next to the address. Leave empty to hide it.",
  mapsUrlError:
    'Enter a full https:// link, for example https://maps.google.com/.',
} as const;

type SettingsRow = {
  whatsappNumber: string | null;
  whatsappMessageEn: string | null;
  whatsappMessageAr: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  latitude: number | null;
  longitude: number | null;
  factoryAddressEn: string | null;
  factoryAddressAr: string | null;
  workingHoursEn: string | null;
  workingHoursAr: string | null;
  mapsUrl: string | null;
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
        contactPhone: true,
        contactEmail: true,
        latitude: true,
        longitude: true,
        factoryAddressEn: true,
        factoryAddressAr: true,
        workingHoursEn: true,
        workingHoursAr: true,
        mapsUrl: true,
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

function seedContact() {
  runInDb(`
    await prisma.siteSettings.create({
      data: {
        id: 'main',
        contactPhone: '+20 100 123 4567',
        contactEmail: 'info@yourcompany.com',
      },
    });
  `);
}

// A pair stored by the previous admin version. The contact form no longer
// edits it, but an ordinary save must not wipe it while the web app still
// renders the map.
function seedStoredCoordinates() {
  runInDb(`
    await prisma.siteSettings.create({
      data: {
        id: 'main',
        latitude: 30.0444,
        longitude: 31.2357,
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
  // invalid-input tests cannot pass because of an earlier test's row.
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
      page.getByRole('heading', { name: COPY.contact, level: 2 })
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
    const preview = page.locator(PREVIEW);
    await expect(preview).toHaveText('https://wa.me/201001234567');
    await expect(preview).toHaveAttribute('href', 'https://wa.me/201001234567');

    await page.getByLabel(COPY.messageEn).fill('Hello from Colina');
    await page.getByLabel(COPY.messageAr).fill('مرحباً من كولينا');

    const auditBefore = countSettingsAudit();
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();
    await expect(page).not.toHaveURL(/saved=1/);
    await expect(preview).toHaveText('https://wa.me/201001234567');

    // The raw "+20 ..." is never what lands in the database. Saving only
    // WhatsApp still works, and leaves every contact/location column null —
    // the rest of the form is optional, not a required second step.
    expect(readSettings()).toEqual({
      whatsappNumber: '201001234567',
      whatsappMessageEn: 'Hello from Colina',
      whatsappMessageAr: 'مرحباً من كولينا',
      contactPhone: null,
      contactEmail: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: null,
      factoryAddressAr: null,
      workingHoursEn: null,
      workingHoursAr: null,
      mapsUrl: null,
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
      contactPhone: null,
      contactEmail: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: null,
      factoryAddressAr: null,
      workingHoursEn: null,
      workingHoursAr: null,
      mapsUrl: null,
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

  test('saves phone and email and round-trips them after reload', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);

    const phone = page.locator(PHONE);
    const email = page.locator(EMAIL);
    await expect(phone).toHaveAttribute('dir', 'ltr');
    await expect(phone).toHaveAttribute('inputmode', 'tel');
    await expect(phone).toHaveAttribute('placeholder', '+20 100 123 4567');
    await expect(email).toHaveAttribute('dir', 'ltr');
    await expect(email).toHaveAttribute('inputmode', 'email');
    await expect(email).toHaveAttribute('placeholder', 'info@yourcompany.com');
    await expect(page.getByText(COPY.phoneHint)).toBeVisible();

    await phone.fill('+20 100 123 4567');
    // The email is trimmed and lowercased by the schema before it is stored.
    await email.fill('  INFO@YourCompany.COM  ');

    const auditBefore = countSettingsAudit();
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: null,
      whatsappMessageAr: null,
      contactPhone: '+20 100 123 4567',
      contactEmail: 'info@yourcompany.com',
      latitude: null,
      longitude: null,
      factoryAddressEn: null,
      factoryAddressAr: null,
      workingHoursEn: null,
      workingHoursAr: null,
      mapsUrl: null,
    });
    expect(countSettingsAudit()).toBe(auditBefore + 1);

    await page.reload();
    await expect(page.locator(PHONE)).toHaveValue('+20 100 123 4567');
    await expect(page.locator(EMAIL)).toHaveValue('info@yourcompany.com');

    await context.close();
  });

  test('invalid phone shows its message and saves nothing', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    const auditBefore = countSettingsAudit();

    await page.locator(PHONE).fill('12345');
    await page.getByRole('button', { name: COPY.save }).click();

    await expect(page.getByText(COPY.phoneError)).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);
    expect(readSettings()).toBeNull();
    expect(countSettingsAudit()).toBe(auditBefore);

    await context.close();
  });

  test('invalid email shows its message and saves nothing', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    const auditBefore = countSettingsAudit();

    await page.locator(EMAIL).fill('not-an-email');
    await page.getByRole('button', { name: COPY.save }).click();

    await expect(page.getByText(COPY.emailError)).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);
    expect(readSettings()).toBeNull();
    expect(countSettingsAudit()).toBe(auditBefore);

    await context.close();
  });

  test('clearing phone and email stores both as null', async ({ browser }) => {
    seedContact();
    const { context, page } = await openSettings(browser);

    await expect(page.locator(PHONE)).toHaveValue('+20 100 123 4567');
    await expect(page.locator(EMAIL)).toHaveValue('info@yourcompany.com');

    await page.locator(PHONE).fill('');
    await page.locator(EMAIL).fill('');
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: null,
      whatsappMessageAr: null,
      contactPhone: null,
      contactEmail: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: null,
      factoryAddressAr: null,
      workingHoursEn: null,
      workingHoursAr: null,
      mapsUrl: null,
    });

    await page.reload();
    await expect(page.locator(PHONE)).toHaveValue('');
    await expect(page.locator(EMAIL)).toHaveValue('');

    await context.close();
  });

  test('round-trips both addresses, working hours and a location link', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);

    await expect(page.getByLabel(COPY.addressEn)).toBeVisible();
    await expect(page.getByLabel(COPY.addressAr)).toBeVisible();
    await expect(page.getByLabel(COPY.hoursEn)).toBeVisible();
    await expect(page.getByLabel(COPY.hoursAr)).toBeVisible();
    await expect(page.getByLabel(COPY.mapsUrl)).toBeVisible();
    await expect(page.getByText(COPY.mapsUrlHint)).toBeVisible();

    await page.locator(ADDRESS_EN).fill('12 Industrial Road, Cairo');
    await page.locator(ADDRESS_AR).fill('١٢ شارع المصنع، القاهرة');
    await page.locator(HOURS_EN).fill('Sun–Thu, 9:00–17:00');
    await page.locator(HOURS_AR).fill('من الأحد إلى الخميس، 9 ص – 5 م');
    await page
      .locator(MAPS_URL)
      .fill('https://maps.google.com/?q=30.0444,31.2357');

    const auditBefore = countSettingsAudit();
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: null,
      whatsappMessageAr: null,
      contactPhone: null,
      contactEmail: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: '12 Industrial Road, Cairo',
      factoryAddressAr: '١٢ شارع المصنع، القاهرة',
      workingHoursEn: 'Sun–Thu, 9:00–17:00',
      workingHoursAr: 'من الأحد إلى الخميس، 9 ص – 5 م',
      mapsUrl: 'https://maps.google.com/?q=30.0444,31.2357',
    });
    expect(countSettingsAudit()).toBe(auditBefore + 1);

    await page.reload();
    await expect(page.locator(ADDRESS_EN)).toHaveValue(
      '12 Industrial Road, Cairo'
    );
    await expect(page.locator(ADDRESS_AR)).toHaveValue(
      '١٢ شارع المصنع، القاهرة'
    );
    await expect(page.locator(HOURS_EN)).toHaveValue('Sun–Thu, 9:00–17:00');
    await expect(page.locator(HOURS_AR)).toHaveValue(
      'من الأحد إلى الخميس، 9 ص – 5 م'
    );
    await expect(page.locator(MAPS_URL)).toHaveValue(
      'https://maps.google.com/?q=30.0444,31.2357'
    );

    await context.close();
  });

  test('rejects an http location link and saves nothing', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    const auditBefore = countSettingsAudit();

    await page
      .locator(MAPS_URL)
      .fill('http://maps.google.com/?q=30.0444,31.2357');
    await page.getByRole('button', { name: COPY.save }).click();

    await expect(page.getByText(COPY.mapsUrlError)).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);
    expect(readSettings()).toBeNull();
    expect(countSettingsAudit()).toBe(auditBefore);

    await context.close();
  });

  test('the form has no map coordinates field', async ({ browser }) => {
    const { context, page } = await openSettings(browser);

    await expect(page.locator(COORDINATES_INPUT)).toHaveCount(0);
    await expect(page.getByTestId('coordinates-preview')).toHaveCount(0);
    await expect(page.getByTestId('coordinates-error')).toHaveCount(0);
    await expect(page.getByText('Map coordinates')).toHaveCount(0);

    await context.close();
  });

  test('saving contact info leaves previously stored coordinates untouched', async ({
    browser,
  }) => {
    seedStoredCoordinates();
    const { context, page } = await openSettings(browser);

    await page.locator(PHONE).fill('+20 100 123 4567');
    await page.locator(EMAIL).fill('info@yourcompany.com');
    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    const row = readSettings();
    expect(row?.latitude).toBe(30.0444);
    expect(row?.longitude).toBe(31.2357);
    expect(row?.contactPhone).toBe('+20 100 123 4567');
    expect(row?.contactEmail).toBe('info@yourcompany.com');

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
