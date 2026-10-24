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
const COORDINATES_INPUT = '#settings-factory-coordinates';
const COORDINATES_PREVIEW = '[data-testid="coordinates-preview"]';
const COORDINATES_ERROR = '[data-testid="coordinates-error"]';
const ADDRESS_EN = '#settings-factory-address-en';
const ADDRESS_AR = '#settings-factory-address-ar';
const HOURS_EN = '#settings-factory-hours-en';
const HOURS_AR = '#settings-factory-hours-ar';
const MAPS_URL = '#settings-factory-maps-url';

const COPY = {
  heading: 'Site settings',
  whatsapp: 'WhatsApp',
  factory: 'Factory location',
  save: 'Save settings',
  saved: 'Saved successfully.',
  numberHint:
    'Enter the number with the country code. Leave empty to hide the WhatsApp button on the website.',
  leadingZero: 'Start with the country code, not 0. Example: +20 100 123 4567.',
  messageEn: 'Default message (English)',
  messageAr: 'Default message (Arabic)',
  coordinates: 'Map coordinates',
  coordinatesHint:
    'On Google Maps, right-click the factory and click the first line (the numbers) to copy them, then paste here. Leave empty to hide the map.',
  coordinatesPreview: 'Open this point on the map',
  coordinatesError:
    'Enter coordinates like 30.0444, 31.2357, or paste a long Google Maps link. On Google Maps, right-click the factory, then click the first line (the numbers) to copy it.',
  coordinatesRange:
    'Latitude must be between -90 and 90, and longitude between -180 and 180.',
  addressEn: 'Address (English)',
  addressAr: 'Address (Arabic)',
  hoursEn: 'Working hours (English)',
  hoursAr: 'Working hours (Arabic)',
  mapsUrl: 'Google Maps link (optional)',
  mapsUrlHint:
    'Used by the Directions button. If empty, a link is built from the coordinates.',
  mapsUrlError:
    'Enter a full https:// link, for example https://maps.google.com/.',
} as const;

type SettingsRow = {
  whatsappNumber: string | null;
  whatsappMessageEn: string | null;
  whatsappMessageAr: string | null;
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

// A saved factory pin plus its free text, used by the "clearing only the
// coordinates" test. The edit page must seed the field from the two numbers,
// not from a stored string.
function seedFactoryLocation() {
  runInDb(`
    await prisma.siteSettings.create({
      data: {
        id: 'main',
        latitude: 30.0444,
        longitude: 31.2357,
        factoryAddressEn: 'Old English address',
        factoryAddressAr: 'العنوان العربي القديم',
        workingHoursEn: 'Old English hours',
        workingHoursAr: 'المواعيد العربية القديمة',
        mapsUrl: 'https://maps.google.com/?q=30.0444,31.2357',
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
    await expect(
      page.getByRole('heading', { name: COPY.factory, level: 2 })
    ).toBeVisible();
    await expect(page.getByText(COPY.numberHint)).toBeVisible();
    await expect(page.getByText(COPY.coordinatesHint)).toBeVisible();

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
    // Saving only WhatsApp still works, and leaves every location column
    // null — the location is an optional group, not a required second step.
    expect(readSettings()).toEqual({
      whatsappNumber: '201001234567',
      whatsappMessageEn: 'Hello from Colina',
      whatsappMessageAr: 'مرحباً من كولينا',
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

  test('round-trips coordinates, both addresses, working hours and a maps link', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);

    const coordinates = page.locator(COORDINATES_INPUT);
    await expect(coordinates).toHaveAttribute('dir', 'ltr');
    await expect(coordinates).toHaveAttribute(
      'placeholder',
      '30.0444, 31.2357'
    );
    await coordinates.fill('30.0444, 31.2357');

    const preview = page.getByTestId('coordinates-preview');
    await expect(preview).toHaveText(COPY.coordinatesPreview);
    await expect(preview).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=30.0444,31.2357'
    );
    await expect(preview).toHaveAttribute('target', '_blank');
    const rel = await preview.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');

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
      latitude: 30.0444,
      longitude: 31.2357,
      factoryAddressEn: '12 Industrial Road, Cairo',
      factoryAddressAr: '١٢ شارع المصنع، القاهرة',
      workingHoursEn: 'Sun–Thu, 9:00–17:00',
      workingHoursAr: 'من الأحد إلى الخميس، 9 ص – 5 م',
      mapsUrl: 'https://maps.google.com/?q=30.0444,31.2357',
    });
    expect(countSettingsAudit()).toBe(auditBefore + 1);

    // A full reload proves the page seeds the field from the two numbers.
    await page.reload();
    await expect(page.locator(COORDINATES_INPUT)).toHaveValue(
      '30.0444, 31.2357'
    );
    await expect(page.getByTestId('coordinates-preview')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=30.0444,31.2357'
    );
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

  test('invalid coordinates show the message and save nothing', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    const auditBefore = countSettingsAudit();

    const cases = [
      { value: 'abc', message: COPY.coordinatesError },
      { value: '91, 31', message: COPY.coordinatesRange },
      {
        value: 'https://maps.app.goo.gl/abc123',
        message: COPY.coordinatesError,
      },
    ] as const;

    for (const { value, message } of cases) {
      await page.locator(COORDINATES_INPUT).fill(value);
      // The live preview turns into the parse error immediately.
      await expect(page.getByTestId('coordinates-error')).toHaveText(message);
      await expect(page.getByTestId('coordinates-preview')).toHaveCount(0);

      await page.getByRole('button', { name: COPY.save }).click();
      await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);
      await expect(page.getByTestId('coordinates-error')).toHaveText(message);

      // The client refused the submit, so the action never ran.
      expect(readSettings(), value).toBeNull();
    }

    expect(countSettingsAudit()).toBe(auditBefore);
    await context.close();
  });

  test('clearing the coordinates stores both numbers as null', async ({
    browser,
  }) => {
    seedFactoryLocation();
    const { context, page } = await openSettings(browser);

    // The edit page formats the saved pair, not the raw pasted URL.
    await expect(page.locator(COORDINATES_INPUT)).toHaveValue(
      '30.0444, 31.2357'
    );
    await expect(page.getByTestId('coordinates-preview')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=30.0444,31.2357'
    );

    await page.locator(COORDINATES_INPUT).fill('');
    await expect(page.getByTestId('coordinates-preview')).toHaveCount(0);

    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: null,
      whatsappMessageAr: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: 'Old English address',
      factoryAddressAr: 'العنوان العربي القديم',
      workingHoursEn: 'Old English hours',
      workingHoursAr: 'المواعيد العربية القديمة',
      mapsUrl: 'https://maps.google.com/?q=30.0444,31.2357',
    });

    await page.reload();
    await expect(page.locator(COORDINATES_INPUT)).toHaveValue('');
    await expect(page.getByTestId('coordinates-preview')).toHaveCount(0);

    await context.close();
  });

  test('accepts a long Google Maps URL and stores the numbers', async ({
    browser,
  }) => {
    const { context, page } = await openSettings(browser);
    const url =
      'https://www.google.com/maps/place/Colina/@30.0444,31.2357,17z/data=!4m2!3m1';

    await page.locator(COORDINATES_INPUT).fill(url);
    await expect(page.getByTestId('coordinates-preview')).toHaveAttribute(
      'href',
      'https://www.google.com/maps?q=30.0444,31.2357'
    );

    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.saved)).toBeVisible();

    expect(readSettings()).toEqual({
      whatsappNumber: null,
      whatsappMessageEn: null,
      whatsappMessageAr: null,
      latitude: 30.0444,
      longitude: 31.2357,
      factoryAddressEn: null,
      factoryAddressAr: null,
      workingHoursEn: null,
      workingHoursAr: null,
      mapsUrl: null,
    });

    await page.reload();
    await expect(page.locator(COORDINATES_INPUT)).toHaveValue(
      '30.0444, 31.2357'
    );

    await context.close();
  });

  test('rejects an http maps link and saves nothing', async ({ browser }) => {
    const { context, page } = await openSettings(browser);

    await page.locator(COORDINATES_INPUT).fill('30.0444, 31.2357');
    await page
      .locator(MAPS_URL)
      .fill('http://maps.google.com/?q=30.0444,31.2357');

    await page.getByRole('button', { name: COPY.save }).click();
    await expect(page.getByText(COPY.mapsUrlError)).toBeVisible();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/settings`);

    expect(readSettings()).toBeNull();

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
