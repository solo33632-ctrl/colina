import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  DATABASE_URL,
  deleteSiteSettings,
  setSiteSettings,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const NUMBER = '201001234567';
const PHONE = '+20 100 123 4567';
const TEL = 'tel:+201001234567';
const EMAIL = 'info@yourcompany.com';
const LONG_EMAIL =
  'very.long.contact.address.for.the.factory.and.sales.department@subdomain.example-company.com';
const MAPS_URL = 'https://maps.google.com/?q=30.0444,31.2357';

const ADDRESS_EN = '12 Industrial Road, Cairo';
const ADDRESS_AR = '١٢ شارع المصنع، القاهرة';
const HOURS_EN = 'Sun–Thu, 9:00–17:00';
const HOURS_AR = 'من الأحد إلى الخميس، 9 ص – 5 م';
const DEFAULT_EN = "Hello, I'd like to ask about your services.";
const DEFAULT_AR = 'مرحباً، أود الاستفسار عن خدماتكم.';

const copy = {
  en: {
    heading: 'Contact info',
    address: 'Address',
    phone: 'Phone',
    whatsapp: 'WhatsApp',
    email: 'Email',
    hours: 'Working hours',
    openInMaps: 'Open in maps',
    addressText: ADDRESS_EN,
    otherAddressText: ADDRESS_AR,
    hoursText: HOURS_EN,
    otherHoursText: HOURS_AR,
    whatsappMessage: DEFAULT_EN,
  },
  ar: {
    heading: 'معلومات التواصل',
    address: 'العنوان',
    phone: 'الهاتف',
    whatsapp: 'واتساب',
    email: 'البريد الإلكتروني',
    hours: 'مواعيد العمل',
    openInMaps: 'افتح في الخرائط',
    addressText: ADDRESS_AR,
    otherAddressText: ADDRESS_EN,
    hoursText: HOURS_AR,
    otherHoursText: HOURS_EN,
    whatsappMessage: DEFAULT_AR,
  },
} as const;

const LOCATION = {
  contactPhone: PHONE,
  contactEmail: EMAIL,
  factoryAddressEn: ADDRESS_EN,
  factoryAddressAr: ADDRESS_AR,
  workingHoursEn: HOURS_EN,
  workingHoursAr: HOURS_AR,
  mapsUrl: MAPS_URL,
} as const;

function whatsappUrl(message: string) {
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(message)}`;
}

const info = (page: Page) => page.getByTestId('contact-info');
const form = (page: Page) => page.locator('main form');
const row = (page: Page, name: string) =>
  page.getByTestId(`contact-info-${name}`);
const whatsappRow = (page: Page) =>
  info(page).getByTestId('whatsapp-contact-row');

async function box(locator: Locator) {
  const measured = await locator.boundingBox();
  if (!measured) {
    throw new Error('the element has no box');
  }
  return measured;
}

async function expectLtrIsolate(locator: Locator) {
  await expect(locator).toHaveAttribute('dir', 'ltr');
  const computed = await locator.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      direction: style.direction,
      unicodeBidi: style.unicodeBidi,
    };
  });
  expect(computed.direction).toBe('ltr');
  expect(computed.unicodeBidi).toBe('isolate');
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.describe('contact info', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL is required to seed SiteSettings');

  test.afterAll(() => {
    if (DATABASE_URL) {
      deleteSiteSettings();
    }
  });

  for (const locale of ['en', 'ar'] as const) {
    const text = copy[locale];

    test.describe(`${locale} at 1280`, () => {
      test.use({ viewport: { width: 1280, height: 900 } });

      test('shows the localized info beside the form with exact links', async ({
        page,
      }) => {
        setSiteSettings({ whatsappNumber: NUMBER, ...LOCATION });

        const response = await page.goto(`${WEB_URL}/${locale}/contact`);
        expect(response).not.toBeNull();

        // The map is gone everywhere: no frame and no Google frame allowance.
        const csp = response?.headers()['content-security-policy'] ?? '';
        expect(csp).toContain("frame-src 'none'");
        expect(csp).not.toContain('https://www.google.com');
        await expect(page.locator('iframe')).toHaveCount(0);

        const infoBlock = info(page);
        await expect(infoBlock).toBeVisible();
        await expect(
          infoBlock.getByRole('heading', { level: 2, name: text.heading })
        ).toBeVisible();

        // Current locale only; the other language is never shown alongside.
        const address = row(page, 'address');
        await expect(address).toContainText(text.addressText);
        await expect(address).not.toContainText(text.otherAddressText);
        const hours = row(page, 'hours');
        await expect(hours).toContainText(text.hoursText);
        await expect(hours).not.toContainText(text.otherHoursText);

        const maps = infoBlock.getByRole('link', { name: text.openInMaps });
        await expect(maps).toHaveAttribute('href', MAPS_URL);
        await expect(maps).toHaveAttribute('target', '_blank');
        const mapsRel = await maps.getAttribute('rel');
        expect(mapsRel).toContain('noopener');
        expect(mapsRel).toContain('noreferrer');

        const phone = row(page, 'phone');
        const phoneLink = phone.getByRole('link');
        await expect(phoneLink).toHaveAttribute('href', TEL);
        const phoneText = phoneLink.locator('span[dir="ltr"]');
        await expect(phoneText).toHaveText(PHONE);
        await expectLtrIsolate(phoneText);

        const email = row(page, 'email');
        const emailLink = email.getByRole('link');
        await expect(emailLink).toHaveAttribute('href', `mailto:${EMAIL}`);
        const emailText = emailLink.locator('span[dir="ltr"]');
        await expect(emailText).toHaveText(EMAIL);
        await expectLtrIsolate(emailText);

        const whatsapp = whatsappRow(page);
        await expect(whatsapp).toBeVisible();
        const whatsappLink = whatsapp.getByRole('link');
        await expect(whatsappLink).toHaveAttribute(
          'href',
          whatsappUrl(text.whatsappMessage)
        );
        await expect(whatsappLink).toHaveAttribute('target', '_blank');
        const whatsappRel = await whatsappLink.getAttribute('rel');
        expect(whatsappRel).toContain('noopener');
        expect(whatsappRel).toContain('noreferrer');
        const whatsappText = whatsappLink.locator('span[dir="ltr"]');
        await expect(whatsappText).toHaveText(`+${NUMBER}`);
        await expectLtrIsolate(whatsappText);

        // Two columns, one row: info on the START side (left in EN, right in
        // AR), form on the END side.
        const infoBox = await box(infoBlock);
        const formBox = await box(form(page));
        expect(Math.abs(infoBox.y - formBox.y)).toBeLessThanOrEqual(2);
        if (locale === 'en') {
          expect(infoBox.x + infoBox.width).toBeLessThanOrEqual(formBox.x + 1);
        } else {
          expect(formBox.x + formBox.width).toBeLessThanOrEqual(infoBox.x + 1);
        }
      });
    });

    test.describe(`${locale} at 390`, () => {
      test.use({ viewport: { width: 390, height: 844 } });

      test('stacks the info above the form and wraps a long email', async ({
        page,
      }) => {
        setSiteSettings({
          whatsappNumber: NUMBER,
          ...LOCATION,
          contactEmail: LONG_EMAIL,
        });

        await page.goto(`${WEB_URL}/${locale}/contact`);

        const infoBox = await box(info(page));
        const formBox = await box(form(page));
        expect(infoBox.y + infoBox.height).toBeLessThanOrEqual(formBox.y + 1);

        const emailText = row(page, 'email').locator('span[dir="ltr"]');
        await expect(emailText).toHaveText(LONG_EMAIL);
        expect(
          await emailText.evaluate(
            (element) => getComputedStyle(element).overflowWrap
          )
        ).toBe('anywhere');
        await expectLtrIsolate(emailText);
        await expectLtrIsolate(row(page, 'phone').locator('span[dir="ltr"]'));
        await expectLtrIsolate(whatsappRow(page).locator('span[dir="ltr"]'));
        await expectNoHorizontalOverflow(page);
      });
    });
  }

  test.describe('fallbacks', () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('only an email renders only the email row', async ({ page }) => {
      setSiteSettings({ whatsappNumber: null, contactEmail: EMAIL });
      await page.goto(`${WEB_URL}/en/contact`);

      await expect(info(page)).toBeVisible();
      await expect(row(page, 'email')).toBeVisible();
      await expect(row(page, 'phone')).toHaveCount(0);
      await expect(row(page, 'address')).toHaveCount(0);
      await expect(row(page, 'hours')).toHaveCount(0);
      await expect(whatsappRow(page)).toHaveCount(0);
    });

    test('an address without a maps link renders no "Open in maps"', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: null, factoryAddressEn: ADDRESS_EN });
      await page.goto(`${WEB_URL}/en/contact`);

      await expect(row(page, 'address')).toContainText(ADDRESS_EN);
      await expect(
        info(page).getByRole('link', { name: 'Open in maps' })
      ).toHaveCount(0);
      await expect(row(page, 'email')).toHaveCount(0);
      await expect(row(page, 'phone')).toHaveCount(0);
      await expect(row(page, 'hours')).toHaveCount(0);
    });

    test('http and javascript maps links are ignored', async ({ page }) => {
      setSiteSettings({
        whatsappNumber: null,
        factoryAddressEn: ADDRESS_EN,
        mapsUrl: 'http://maps.google.com/?q=30.0444,31.2357',
      });
      await page.goto(`${WEB_URL}/en/contact`);
      await expect(
        info(page).getByRole('link', { name: 'Open in maps' })
      ).toHaveCount(0);

      setSiteSettings({
        whatsappNumber: null,
        factoryAddressEn: ADDRESS_EN,
        mapsUrl: 'javascript:alert(1)',
      });
      await page.goto(`${WEB_URL}/en/contact`);
      await expect(
        info(page).getByRole('link', { name: 'Open in maps' })
      ).toHaveCount(0);
    });

    test('invalid stored phone and email are ignored; the form stays centred', async ({
      page,
    }) => {
      setSiteSettings({
        whatsappNumber: null,
        contactPhone: 'abc',
        contactEmail: 'not-an-email',
      });
      await page.goto(`${WEB_URL}/en/contact`);

      await expect(info(page)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Contact info' })
      ).toHaveCount(0);
      await expect(form(page)).toBeVisible();

      const formBox = await box(form(page));
      expect(
        Math.abs(formBox.x + formBox.width / 2 - 1280 / 2)
      ).toBeLessThanOrEqual(2);
    });

    test('no settings at all renders only the centred form', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: null });
      await page.goto(`${WEB_URL}/en/contact`);

      await expect(info(page)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Contact info' })
      ).toHaveCount(0);
      await expect(form(page)).toBeVisible();

      const formBox = await box(form(page));
      expect(
        Math.abs(formBox.x + formBox.width / 2 - 1280 / 2)
      ).toBeLessThanOrEqual(2);
    });

    test('working hours keep their line breaks', async ({ page }) => {
      setSiteSettings({
        whatsappNumber: null,
        workingHoursEn: 'Sun–Thu\n9:00–17:00',
      });
      await page.goto(`${WEB_URL}/en/contact`);

      const hours = row(page, 'hours').locator('dd');
      const hoursText = await hours.innerText();
      expect(hoursText).toContain('Sun–Thu');
      expect(hoursText).toContain('9:00–17:00');
      expect(hoursText).toContain('\n');
      expect(
        await hours.evaluate((element) => getComputedStyle(element).whiteSpace)
      ).toBe('pre-line');
      const lineCount = await hours.evaluate((element) => {
        const range = document.createRange();
        range.selectNodeContents(element);
        return range.getClientRects().length;
      });
      expect(lineCount).toBeGreaterThanOrEqual(2);
    });
  });

  test('home and contact contain no map iframe and home has no location section', async ({
    page,
  }) => {
    setSiteSettings({ whatsappNumber: NUMBER, ...LOCATION });

    const response = await page.goto(`${WEB_URL}/en`);
    expect(response).not.toBeNull();
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain("frame-src 'none'");
    expect(csp).not.toContain('https://www.google.com');
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('#location')).toHaveCount(0);

    await page.goto(`${WEB_URL}/en/contact`);
    await expect(page.locator('iframe')).toHaveCount(0);
    await expect(page.locator('#location')).toHaveCount(0);
  });
});
