import { test, expect } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3120';
const ENDPOINT = '/api/page-view';

const CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const CRAWLER_UA =
  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

// The tracker posts a Blob through `navigator.sendBeacon`, whose body
// Playwright reports as `null` — so the payload is read from inside the page
// instead, by wrapping sendBeacon and recording what it was handed. The
// original still runs, so the request really is sent (and really is counted).
async function captureBeacons(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const seen: { url: string; body: string }[] = [];
    (window as unknown as { __beacons: typeof seen }).__beacons = seen;
    const original = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = (url: string | URL, data?: BodyInit | null) => {
      if (data instanceof Blob) {
        void data
          .text()
          .then((text) => seen.push({ url: String(url), body: text }));
      } else if (typeof data === 'string') {
        seen.push({ url: String(url), body: data });
      }
      return original(url, data);
    };
  });
  return async () =>
    page.evaluate(
      () =>
        (window as unknown as { __beacons: { url: string; body: string }[] })
          .__beacons
    ) ?? [];
}

// One row per page view is what the privacy policy promises, so each case
// asserts exactly one beacon for one page load — not "at least one".
test.describe('page-view counting', () => {
  test('an Arabic page reports its locale-agnostic path and "ar"', async ({
    page,
  }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${WEB_URL}/ar/machines/colina-pack-s`);
    await expect.poll(() => beacons().then((b) => b.length)).toBe(1);
    expect(JSON.parse((await beacons())[0].body)).toEqual({
      path: '/machines/colina-pack-s',
      locale: 'ar',
    });
  });

  test('the English page reports the same path with "en"', async ({ page }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${WEB_URL}/en/machines/colina-pack-s`);
    await expect.poll(() => beacons().then((b) => b.length)).toBe(1);
    expect(JSON.parse((await beacons())[0].body)).toEqual({
      path: '/machines/colina-pack-s',
      locale: 'en',
    });
  });

  test('a static page reports its own path', async ({ page }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${WEB_URL}/ar/privacy`);
    await expect.poll(() => beacons().then((b) => b.length)).toBe(1);
    expect(JSON.parse((await beacons())[0].body)).toEqual({
      path: '/privacy',
      locale: 'ar',
    });
  });

  test('exactly one beacon per page load', async ({ page }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${WEB_URL}/ar/services`);
    await expect.poll(() => beacons().then((b) => b.length)).toBe(1);
    await page.waitForTimeout(1000);
    expect(await beacons()).toHaveLength(1);
  });

  test('a client-side navigation reports the page it lands on', async ({
    page,
  }) => {
    const beacons = await captureBeacons(page);
    await page.goto(`${WEB_URL}/ar/categories/production-lines`);
    await expect.poll(() => beacons().then((b) => b.length)).toBe(1);
    await page.locator('main a[href*="/machines/"]').first().click();
    await page.waitForURL('**/machines/**');
    await expect.poll(() => beacons().then((b) => b.length)).toBe(2);
    expect(JSON.parse((await beacons())[1].body)).toMatchObject({
      path: expect.stringMatching(/^\/machines\/[a-z0-9-]+$/),
      locale: 'ar',
    });
  });

  test('the endpoint answers a browser request with 204 and no body', async ({
    request,
  }) => {
    const response = await request.post(`${WEB_URL}${ENDPOINT}`, {
      headers: { 'user-agent': CHROME_UA, origin: WEB_URL },
      data: { path: '/privacy', locale: 'en' },
    });
    expect(response.status()).toBe(204);
    expect(await response.text()).toBe('');
  });

  test('a crawler gets the same 204, so it cannot tell it was filtered', async ({
    request,
  }) => {
    // Filtering happens on the server, not in the page — the crawler is
    // answered exactly like a visitor and nothing is written. That the write
    // really is skipped is covered by the filter's unit tests and by the live
    // database check; this suite has no database access.
    const response = await request.post(`${WEB_URL}${ENDPOINT}`, {
      headers: { 'user-agent': CRAWLER_UA, origin: WEB_URL },
      data: { path: '/privacy', locale: 'en' },
    });
    expect(response.status()).toBe(204);
  });

  test('the endpoint rejects a path that is not a public page', async ({
    request,
  }) => {
    const response = await request.post(`${WEB_URL}${ENDPOINT}`, {
      headers: { 'user-agent': CHROME_UA, origin: WEB_URL },
      data: { path: '/api/contact', locale: 'en' },
    });
    expect(response.status()).toBe(400);
  });

  test('the endpoint rejects an unknown locale', async ({ request }) => {
    const response = await request.post(`${WEB_URL}${ENDPOINT}`, {
      headers: { 'user-agent': CHROME_UA, origin: WEB_URL },
      data: { path: '/privacy', locale: 'fr' },
    });
    expect(response.status()).toBe(400);
  });

  test('the endpoint rejects a cross-origin post', async ({ request }) => {
    const response = await request.post(`${WEB_URL}${ENDPOINT}`, {
      headers: { 'user-agent': CHROME_UA, origin: 'http://not-this-site.test' },
      data: { path: '/privacy', locale: 'en' },
    });
    expect(response.status()).toBe(400);
  });
});
