import { test, expect, type Page } from '@playwright/test';
import { deleteSiteSettings, setSiteSettings } from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const NUMBER = '201001234567';

const SANDBOX =
  'allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox';

const LOCATION = {
  latitude: 30.0444,
  longitude: 31.2357,
  factoryAddressEn: '12 Industrial Road, Cairo',
  factoryAddressAr: '١٢ شارع المصنع، القاهرة',
  workingHoursEn: 'Sun–Thu, 9:00–17:00',
  workingHoursAr: 'من الأحد إلى الخميس، 9 ص – 5 م',
  mapsUrl: 'https://maps.google.com/?q=30.0444,31.2357',
} as const;

const copy = {
  en: {
    heading: 'Visit our factory',
    address: 'Address',
    hours: 'Working hours',
    directions: 'Get directions',
    openMap: 'Open in Google Maps',
    mapTitle: 'Map showing the Colina factory location',
    addressText: LOCATION.factoryAddressEn,
    hoursText: LOCATION.workingHoursEn,
  },
  ar: {
    heading: 'زورونا في المصنع',
    address: 'العنوان',
    hours: 'مواعيد العمل',
    directions: 'احصل على الاتجاهات',
    openMap: 'افتح في خرائط جوجل',
    mapTitle: 'خريطة توضح موقع مصنع كولينا',
    addressText: LOCATION.factoryAddressAr,
    hoursText: LOCATION.workingHoursAr,
  },
} as const;

type Locale = keyof typeof copy;

const other = (locale: Locale): Locale => (locale === 'en' ? 'ar' : 'en');

const DIRECTIONS_URL =
  'https://www.google.com/maps/dir/?api=1&destination=30.0444,31.2357';
const SEARCH_URL =
  'https://www.google.com/maps/search/?api=1&query=30.0444,31.2357';

function embedUrl(locale: Locale) {
  return `https://www.google.com/maps?q=30.0444,31.2357&z=15&hl=${locale}&output=embed`;
}

/** The intro plays once per session; these tests are about the last section. */
async function skipIntro(page: Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('colina.intro-seen', '1');
  });
}

/**
 * The e2e environment may be offline, and the tests must not depend on Google
 * answering. Every Google request is aborted; the iframe's attributes and the
 * anchors' hrefs are still fully asserted.
 */
async function blockGoogle(page: Page) {
  await page.route(/google\.com/, (route) => route.abort());
}

function overlap(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
) {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

test.afterAll(() => {
  deleteSiteSettings();
});

for (const locale of ['en', 'ar'] as const) {
  const text = copy[locale];
  const fallback = copy[other(locale)];

  test.describe(`factory location (${locale}, 1280)`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('shows the localized card, map and links on home and contact', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: null, ...LOCATION });
      await skipIntro(page);
      await blockGoogle(page);

      const response = await page.goto(`${WEB_URL}/${locale}`);
      expect(response).not.toBeNull();

      const section = page.locator('#location');
      await expect(section).toBeVisible();
      await expect(
        section.getByRole('heading', { level: 2, name: text.heading })
      ).toBeVisible();

      // Home placement: the last section inside <main>, immediately before the
      // layout's footer.
      expect(
        await page.evaluate(
          () => document.querySelector('main')?.lastElementChild?.id ?? null
        )
      ).toBe('location');

      // Current-locale text only; the other language is a fallback, never
      // shown alongside.
      const info = page.getByTestId('factory-info');
      await expect(info.getByText(text.address, { exact: true })).toBeVisible();
      await expect(info.getByText(text.hours, { exact: true })).toBeVisible();
      await expect(page.getByTestId('factory-address')).toContainText(
        text.addressText
      );
      await expect(page.getByTestId('factory-address')).not.toContainText(
        fallback.addressText
      );
      await expect(page.getByTestId('factory-hours')).toContainText(
        text.hoursText
      );
      await expect(page.getByTestId('factory-hours')).not.toContainText(
        fallback.hoursText
      );

      // The map: exact embed URL for the locale, lazy, sandboxed, no border.
      const frame = page.getByTestId('factory-map');
      await expect(frame).toHaveAttribute('src', embedUrl(locale));
      await expect(frame).toHaveAttribute('loading', 'lazy');
      await expect(frame).toHaveAttribute('title', text.mapTitle);
      await expect(frame).toHaveAttribute('sandbox', SANDBOX);
      await expect(frame).toHaveAttribute(
        'referrerpolicy',
        'no-referrer-when-downgrade'
      );
      expect(
        await frame.evaluate((el) => getComputedStyle(el).borderTopWidth)
      ).toBe('0px');
      await expect(page.locator('iframe[src*="openstreetmap"]')).toHaveCount(0);

      // Directions always uses the coordinates; open uses the stored link.
      const directions = section.getByRole('link', {
        name: text.directions,
      });
      await expect(directions).toHaveAttribute('href', DIRECTIONS_URL);
      await expect(directions).toHaveAttribute('target', '_blank');
      const directionsRel = await directions.getAttribute('rel');
      expect(directionsRel).toContain('noopener');
      expect(directionsRel).toContain('noreferrer');

      const open = section.getByRole('link', { name: text.openMap });
      await expect(open).toHaveAttribute('href', LOCATION.mapsUrl);
      await expect(open).toHaveAttribute('target', '_blank');
      const openRel = await open.getAttribute('rel');
      expect(openRel).toContain('noopener');
      expect(openRel).toContain('noreferrer');

      // CSP: the frame must be allowed, and only Google is added.
      const csp = response?.headers()['content-security-policy'] ?? '';
      expect(csp).toContain('frame-src https://www.google.com');
      expect(csp).not.toContain('openstreetmap');

      // The same component on the contact page, after the form.
      await page.goto(`${WEB_URL}/${locale}/contact`);
      await expect(section).toBeVisible();
      await expect(
        section.getByRole('heading', { level: 2, name: text.heading })
      ).toBeVisible();
      await expect(page.getByTestId('factory-address')).toContainText(
        text.addressText
      );
      await expect(page.getByTestId('factory-map')).toHaveAttribute(
        'src',
        embedUrl(locale)
      );
      await expect(
        section.getByRole('link', { name: text.directions })
      ).toHaveAttribute('href', DIRECTIONS_URL);
      await expect(
        section.getByRole('link', { name: text.openMap })
      ).toHaveAttribute('href', LOCATION.mapsUrl);
    });

    test('places the info card on the START side at equal height', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: null, ...LOCATION });
      await skipIntro(page);
      await blockGoogle(page);
      await page.goto(`${WEB_URL}/${locale}`);

      const section = page.locator('#location');
      await section.scrollIntoViewIfNeeded();

      const info = await page.getByTestId('factory-info').boundingBox();
      const frame = await page.getByTestId('factory-map-frame').boundingBox();
      expect(info).not.toBeNull();
      expect(frame).not.toBeNull();

      // Same grid row, same height (the card stretches; the map is the
      // fixed-height frame).
      expect(Math.abs(info!.y - frame!.y)).toBeLessThanOrEqual(2);
      expect(Math.abs(info!.height - frame!.height)).toBeLessThanOrEqual(2);

      if (locale === 'en') {
        // LTR: first grid item is on the left.
        expect(info!.x + info!.width).toBeLessThanOrEqual(frame!.x);
      } else {
        // RTL: first grid item is on the right.
        expect(frame!.x + frame!.width).toBeLessThanOrEqual(info!.x);
      }
    });
  });

  test.describe(`factory location (${locale}, 390)`, () => {
    test.use({ viewport: { width: 390, height: 844 } });

    test('stacks the card above the map without overflow and keeps its height', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: null, ...LOCATION });
      await skipIntro(page);
      await blockGoogle(page);
      await page.goto(`${WEB_URL}/${locale}`);

      const section = page.locator('#location');
      await section.scrollIntoViewIfNeeded();

      const info = await page.getByTestId('factory-info').boundingBox();
      const frame = await page.getByTestId('factory-map-frame').boundingBox();
      expect(info).not.toBeNull();
      expect(frame).not.toBeNull();

      // Stacked: card first, map below.
      expect(info!.y + info!.height).toBeLessThanOrEqual(frame!.y);
      expect(info!.x).toBeCloseTo(frame!.x, 0);

      // No horizontal overflow at the narrow width.
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        )
      ).toBeLessThanOrEqual(1);

      // The frame reserves its h-80 space before/without a Google load, so
      // there is no layout shift when the iframe eventually loads.
      expect(Math.abs(frame!.height - 320)).toBeLessThanOrEqual(1);
      await page.waitForTimeout(500);
      const after = await page.getByTestId('factory-map-frame').boundingBox();
      expect(after).not.toBeNull();
      expect(Math.abs(after!.height - frame!.height)).toBeLessThanOrEqual(1);
      expect(Math.abs(after!.y - frame!.y)).toBeLessThanOrEqual(1);
    });

    test('the floating WhatsApp button does not overlap the section buttons', async ({
      page,
    }) => {
      setSiteSettings({ whatsappNumber: NUMBER, ...LOCATION });
      await skipIntro(page);
      await blockGoogle(page);
      await page.goto(`${WEB_URL}/${locale}`);

      const directions = page
        .locator('#location')
        .getByRole('link', { name: text.directions });
      const open = page
        .locator('#location')
        .getByRole('link', { name: text.openMap });

      // Put the last button at the bottom edge of the viewport, the position
      // where a fixed bottom-end button is most likely to collide.
      await open.evaluate((el) => el.scrollIntoView({ block: 'end' }));
      await expect(directions).toBeVisible();
      await expect(open).toBeVisible();

      const whatsapp = await page.getByTestId('whatsapp-button').boundingBox();
      const directionsBox = await directions.boundingBox();
      const openBox = await open.boundingBox();
      expect(whatsapp).not.toBeNull();
      expect(directionsBox).not.toBeNull();
      expect(openBox).not.toBeNull();

      expect(overlap(whatsapp!, directionsBox!)).toBe(false);
      expect(overlap(whatsapp!, openBox!)).toBe(false);
    });
  });
}

test.describe('factory location fallbacks (en, 1280)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('coordinates without a stored link fall back to the coordinate URLs', async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: null,
      latitude: LOCATION.latitude,
      longitude: LOCATION.longitude,
      mapsUrl: null,
    });
    await skipIntro(page);
    await blockGoogle(page);
    await page.goto(`${WEB_URL}/en`);

    const section = page.locator('#location');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('factory-map')).toHaveAttribute(
      'src',
      embedUrl('en')
    );
    await expect(
      section.getByRole('link', { name: copy.en.directions })
    ).toHaveAttribute('href', DIRECTIONS_URL);
    await expect(
      section.getByRole('link', { name: copy.en.openMap })
    ).toHaveAttribute('href', SEARCH_URL);
  });

  test('address only renders the card with no map and no buttons', async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: 'Address only',
      mapsUrl: null,
    });
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en`);

    const section = page.locator('#location');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('factory-address')).toContainText(
      'Address only'
    );
    await expect(page.getByTestId('factory-map')).toHaveCount(0);
    await expect(section.getByRole('link')).toHaveCount(0);
  });

  test('hours only still renders the section', async ({ page }) => {
    setSiteSettings({
      whatsappNumber: null,
      workingHoursEn: 'Hours only',
    });
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en`);

    const section = page.locator('#location');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('factory-hours')).toContainText('Hours only');
    await expect(page.getByTestId('factory-address')).toHaveCount(0);
    await expect(page.getByTestId('factory-map')).toHaveCount(0);
    await expect(section.getByRole('link')).toHaveCount(0);
  });

  test('no row or an all-null row renders no section anywhere', async ({
    page,
  }) => {
    deleteSiteSettings();
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en`);
    await expect(page.locator('#location')).toHaveCount(0);
    await page.goto(`${WEB_URL}/en/contact`);
    await expect(page.locator('#location')).toHaveCount(0);

    setSiteSettings({ whatsappNumber: null });
    await page.goto(`${WEB_URL}/en`);
    await expect(page.locator('#location')).toHaveCount(0);
    await page.goto(`${WEB_URL}/en/contact`);
    await expect(page.locator('#location')).toHaveCount(0);
  });

  test('invalid stored values hide the map and are ignored as links', async ({
    page,
  }) => {
    // Out-of-range latitude + an http maps link: no map, no buttons.
    setSiteSettings({
      whatsappNumber: null,
      latitude: 91,
      longitude: 31,
      factoryAddressEn: 'Invalid pin',
      mapsUrl: 'http://maps.google.com/?q=30.0444,31.2357',
    });
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en?case=range`);
    await expect(page.locator('#location')).toBeVisible();
    await expect(page.getByTestId('factory-address')).toContainText(
      'Invalid pin'
    );
    await expect(page.getByTestId('factory-map')).toHaveCount(0);
    await expect(page.locator('#location').getByRole('link')).toHaveCount(0);

    // A lone latitude and a javascript: link: still nothing usable.
    setSiteSettings({
      whatsappNumber: null,
      latitude: 30.0444,
      longitude: null,
      factoryAddressEn: 'Lone pin',
      mapsUrl: 'javascript:alert(1)',
    });
    await page.goto(`${WEB_URL}/en?case=lone`);
    await expect(page.locator('#location')).toBeVisible();
    await expect(page.getByTestId('factory-map')).toHaveCount(0);
    await expect(page.locator('#location').getByRole('link')).toHaveCount(0);

    // No coordinates but a valid stored link: only the open button.
    setSiteSettings({
      whatsappNumber: null,
      latitude: null,
      longitude: null,
      factoryAddressEn: 'Link only',
      mapsUrl: LOCATION.mapsUrl,
    });
    await page.goto(`${WEB_URL}/en?case=link`);
    const section = page.locator('#location');
    await expect(section).toBeVisible();
    await expect(page.getByTestId('factory-map')).toHaveCount(0);
    await expect(
      section.getByRole('link', { name: copy.en.directions })
    ).toHaveCount(0);
    await expect(
      section.getByRole('link', { name: copy.en.openMap })
    ).toHaveAttribute('href', LOCATION.mapsUrl);
  });

  test('the effective CSP allows Google Maps frames and nothing looser', async ({
    page,
  }) => {
    const response = await page.goto(`${WEB_URL}/en`);
    expect(response).not.toBeNull();
    const csp = response?.headers()['content-security-policy'] ?? '';
    expect(csp).toContain('frame-src https://www.google.com');
    expect(csp).not.toContain('openstreetmap');
    expect(csp).not.toContain('frame-src *');
    expect(csp).toContain("default-src 'self'");
  });
});
