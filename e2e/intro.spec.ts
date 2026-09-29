import { test, expect } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3120';
const SESSION_KEY = 'colina.intro-seen';
const OVERLAY = '[data-testid="intro-overlay"]';

// Every test drives its own context, and sessionStorage is per-context, so each
// one starts from a genuinely fresh session. The suite runs on one worker
// (see playwright.config.ts), so the "plays once" and "does not replay" cases
// cannot contaminate each other.
test.describe('home page brand intro', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: plays once on a first visit, then never again`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}`);

      // It plays, and it is gone on its own without any interaction.
      await expect(page.locator(OVERLAY)).toBeAttached();
      await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });

      // The session is marked, and the content underneath was never gated on it.
      expect(
        await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)
      ).toBe('1');
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });

    test(`${locale}: a reload in the same session does not replay it`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}`);
      await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });

      await page.reload();
      // No overlay at any point: assert after the animation would have run.
      await page.waitForTimeout(1500);
      await expect(page.locator(OVERLAY)).toHaveCount(0);
    });

    test(`${locale}: an internal navigation back to home does not replay it`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}`);
      await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });

      await page
        .getByRole('link', { name: /^(Home|الرئيسية)$/ })
        .first()
        .click();
      await page.waitForTimeout(1500);
      await expect(page.locator(OVERLAY)).toHaveCount(0);
    });
  }

  // A splash on a deep link would be a loading gate on every shared URL and
  // every search result, which is exactly what it must not be.
  for (const path of [
    '/en/about',
    '/ar/services',
    '/en/machines/colina-pro-2000',
    '/ar/machines/colina-pro-2000',
  ]) {
    test(`a deep link never shows it: ${path}`, async ({ page }) => {
      await page.goto(WEB_URL + path);
      await page.waitForTimeout(1500);
      await expect(page.locator(OVERLAY)).toHaveCount(0);
      // Not even the session marker: the gate is not mounted off the home page.
      expect(
        await page.evaluate((k) => sessionStorage.getItem(k), SESSION_KEY)
      ).toBeNull();
    });
  }

  test('reduced motion skips it and leaves the content visible', async ({
    browser,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      const context = await browser.newContext({ reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/${locale}`);
      await page.waitForTimeout(1200);

      await expect(page.locator(OVERLAY)).toHaveCount(0);
      // The entrance below the fold must be settled, not left at opacity 0.
      const opacity = await page
        .locator('#categories-heading')
        .evaluate((el) => getComputedStyle(el.closest('div')!).opacity);
      expect(opacity).toBe('1');
      await context.close();
    }
  });

  test('the overlay is a layer, not a gate', async ({ page }) => {
    await page.goto(`${WEB_URL}/en`);
    const overlay = page.locator(OVERLAY);
    await expect(overlay).toBeAttached();

    // Hidden from assistive tech and out of the tab order...
    await expect(overlay).toHaveAttribute('aria-hidden', 'true');
    expect(
      await overlay.evaluate(
        (el) =>
          el.querySelectorAll('a,button,input,select,textarea,[tabindex]')
            .length
      )
    ).toBe(0);

    // ...the page is already rendered and interactive beneath it...
    await expect(page.locator('#categories-heading')).toBeAttached();
    await expect(page.locator('#featured-machines-heading')).toBeAttached();

    // ...and a click reaches the page rather than the overlay.
    const cta = page.getByRole('link', { name: 'Get in touch' }).first();
    const box = await cta.boundingBox();
    expect(box).not.toBeNull();
    const hit = await page.evaluate(
      ({ x, y }) =>
        document.elementFromPoint(x, y)?.className?.toString() ?? '',
      { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 }
    );
    expect(hit).not.toContain('colina-intro-backdrop');
  });

  // The overlay is centred with logical-safe utilities; a physical offset is
  // what made the honeypot extend Arabic pages by ~10000px.
  test('the intro does not widen the document in either direction', async ({
    browser,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      // A context per locale: sessionStorage is per-origin, so sharing one
      // would mark the session on the first locale and correctly skip the
      // splash on the second, leaving nothing to measure.
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/${locale}`);
      await expect(page.locator(OVERLAY)).toBeAttached();
      const during = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(during.scroll).toBeLessThanOrEqual(during.client + 1);

      await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });
      const after = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(after.scroll).toBeLessThanOrEqual(after.client + 1);
      await context.close();
    }
  });

  // Two <img> elements (header + overlay) must resolve to one request, or the
  // brand moment costs a duplicate download of the same file.
  test('the header and overlay share a single logo request', async ({
    page,
  }) => {
    const logoRequests: string[] = [];
    page.on('request', (r) => {
      if (r.url().includes('logo.png')) logoRequests.push(r.url());
    });

    await page.goto(`${WEB_URL}/en`);
    // Mid-animation is the only moment both copies exist.
    await expect(page.locator(OVERLAY)).toBeAttached();
    expect(await page.locator('img[src*="logo.png"]').count()).toBe(2);
    await expect(page.locator(OVERLAY)).toHaveCount(0, { timeout: 8000 });

    expect(logoRequests).toHaveLength(1);
  });

  // The hero must never start at opacity 0: Chrome drops an element painted
  // that way from the LCP candidate set for good, which cost ~14 Lighthouse
  // performance points before it was caught.
  test('the hero is painted immediately, so it stays the LCP candidate', async ({
    page,
  }) => {
    await page.addInitScript(() => {
      (window as unknown as { __lcp: unknown[] }).__lcp = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          (window as unknown as { __lcp: unknown[] }).__lcp.push({
            tag: (entry as { element?: Element }).element?.tagName,
            size: entry.size,
          });
        }
      }).observe({ type: 'largest-contentful-paint', buffered: true });
    });

    await page.goto(`${WEB_URL}/en`);
    await page.waitForTimeout(2500);

    const candidates = await page.evaluate(
      () =>
        (window as unknown as { __lcp: { tag?: string; size: number }[] }).__lcp
    );
    // The largest candidate has to be real content, not the 58x40 header logo.
    const largest = candidates.reduce((a, b) => (b.size > a.size ? b : a));
    expect(largest.tag).toMatch(/^(H1|P)$/);
  });
});
