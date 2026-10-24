import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  SHOWCASE_PHOTOS,
  cleanupFixtures,
  createCategory,
  createMaintenanceCategory,
  createShowcase,
  deleteMaintenanceCategoriesByTag,
  deleteShowcasesByTag,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Fixtures are tagged like every other spec's, so a crashed run is
// identifiable by eye and cleanup can find the rows without their cuids.
const TAG = 'st28a';
const STAMP = `${TAG}-${Date.now().toString(36)}`;

const PRODUCT_SLUG = `hover-product-${STAMP}`;
const PRODUCT_NAME_EN = `Hover Product Category ${STAMP} With A Deliberately Long Name`;
const PRODUCT_NAME_AR = `فئة منتج التمرير ${STAMP} باسم طويل للغاية`;

const LINE_SLUG = `hover-line-${STAMP}`;
const LINE_NAME_EN = `Hover Maintenance Line ${STAMP} With A Deliberately Long Name`;
const LINE_NAME_AR = `خط صيانة التمرير ${STAMP} باسم طويل للغاية`;

const COPY = {
  en: {
    productHover: 'Explore this category',
    maintenanceHover: "See this line's machines before and after maintenance",
    view: 'View',
  },
  ar: {
    productHover: 'اكتشف تفاصيل هذه الفئة',
    maintenanceHover: 'شاهد ماكينات هذا الخط قبل الصيانة وبعدها',
    view: 'عرض',
  },
} as const;

type Locale = keyof typeof COPY;

const productName = (locale: Locale) =>
  locale === 'ar' ? PRODUCT_NAME_AR : PRODUCT_NAME_EN;
const lineName = (locale: Locale) =>
  locale === 'ar' ? LINE_NAME_AR : LINE_NAME_EN;

const productCard = (page: Page) =>
  page.locator(`main ul li a[href$="/categories/${PRODUCT_SLUG}"]`);
const lineCard = (page: Page) =>
  page.locator(`main ul li a[href$="/maintenance/${LINE_SLUG}"]`);

test.beforeAll(() => {
  cleanupFixtures(TAG);
  createCategory({
    slug: PRODUCT_SLUG,
    nameEn: PRODUCT_NAME_EN,
    nameAr: PRODUCT_NAME_AR,
    image: SHOWCASE_PHOTOS.before,
  });
  createMaintenanceCategory({
    slug: LINE_SLUG,
    nameEn: LINE_NAME_EN,
    nameAr: LINE_NAME_AR,
    imageUrl: SHOWCASE_PHOTOS.before,
  });
  createShowcase({
    nameEn: `Hover Machine ${STAMP}`,
    nameAr: `ماكينة التمرير ${STAMP}`,
    categorySlug: LINE_SLUG,
  });
});

test.afterAll(() => {
  deleteShowcasesByTag(TAG);
  deleteMaintenanceCategoriesByTag(TAG);
  cleanupFixtures(TAG);
});

type Box = { top: number; right: number; bottom: number; left: number };

/**
 * Everything the hover state is made of, measured in one round trip.
 *
 * The reveal is found by its test id rather than by text, so the same helper
 * works for the product and maintenance copy. The overlay is the element that
 * carries the scrim; for a photo tile it is translucent black.
 */
async function measureCard(card: Locator) {
  return card.evaluate((el) => {
    const box = (node: Element): Box => {
      const rect = node.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
      };
    };
    const reveal = el.querySelector('[data-testid="category-card-reveal"]')!;
    const view = el.querySelector('[data-testid="category-card-view"]')!;
    const text = reveal.querySelector('p')!;
    const name = el.querySelector('h3')!;
    const overlay = el.querySelector('[data-testid="category-card-overlay"]')!;
    const background = getComputedStyle(overlay).backgroundColor;
    const alpha = background.match(/rgba\(0,\s*0,\s*0,\s*([\d.]+)\)/);

    return {
      card: box(el),
      name: box(name),
      reveal: box(reveal),
      text: box(text),
      view: box(view),
      revealOpacity: Number(getComputedStyle(reveal).opacity),
      overlayAlpha: alpha ? Number(alpha[1]) : null,
      nestedLinks: el.querySelectorAll('a').length,
    };
  });
}

function expectInside(inner: Box, outer: Box, label: string) {
  expect(inner.top, `${label} top`).toBeGreaterThanOrEqual(outer.top - 0.5);
  expect(inner.bottom, `${label} bottom`).toBeLessThanOrEqual(
    outer.bottom + 0.5
  );
  expect(inner.left, `${label} left`).toBeGreaterThanOrEqual(outer.left - 0.5);
  expect(inner.right, `${label} right`).toBeLessThanOrEqual(outer.right + 0.5);
}

for (const locale of ['en', 'ar'] as const) {
  test(`${locale} at 1280: product cards reveal copy and a View pill on hover`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/${locale}/categories`);

    const card = productCard(page);
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();

    // One link, named exactly by the category: the reveal is aria-hidden and
    // adds nothing to the accessible name.
    await expect(card).toHaveAttribute('aria-label', productName(locale));
    await expect(
      page.getByRole('link', { name: productName(locale), exact: true })
    ).toHaveCount(1);

    const before = await measureCard(card);
    expect(before.nestedLinks).toBe(0);
    expect(before.revealOpacity).toBe(0);
    expect(before.overlayAlpha).toBeCloseTo(0.6, 2);

    await card.hover();
    await page.waitForTimeout(700);
    const after = await measureCard(card);

    expect(after.revealOpacity).toBe(1);
    expect(after.overlayAlpha).toBeCloseTo(0.7, 2);
    // The name block moved up, not merely the tile.
    expect(after.name.top).toBeLessThan(before.name.top - 4);

    // The name may be two lines here, and the hover copy clamps at two: all
    // of it still has to sit inside the square.
    expectInside(after.reveal, after.card, 'reveal');
    expectInside(after.text, after.card, 'hover text');
    expectInside(after.view, after.card, 'view pill');

    await expect(card.getByText(COPY[locale].productHover)).toBeVisible();
    await expect(
      card.getByText(COPY[locale].view, { exact: true })
    ).toBeVisible();
  });

  test(`${locale} at 1280: maintenance cards reveal their own copy and count`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/${locale}/maintenance`);

    const card = lineCard(page);
    await expect(card).toHaveCount(1);
    await card.scrollIntoViewIfNeeded();
    await expect(card).toContainText(lineName(locale));

    await card.hover();
    await page.waitForTimeout(700);
    const state = await measureCard(card);

    expect(state.revealOpacity).toBe(1);
    expect(state.overlayAlpha).toBeCloseTo(0.7, 2);
    expectInside(state.reveal, state.card, 'reveal');
    expectInside(state.text, state.card, 'hover text');
    expectInside(state.view, state.card, 'view pill');
    await expect(card.getByText(COPY[locale].maintenanceHover)).toBeVisible();
    await expect(
      card.getByText(COPY[locale].view, { exact: true })
    ).toBeVisible();
  });

  test(`${locale} at 1280: keyboard focus reveals the same state and a focus ring`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/${locale}/categories`);

    const card = productCard(page);
    await card.scrollIntoViewIfNeeded();
    const href = await card.getAttribute('href');

    // Genuine keyboard focus: Tab until the card itself owns it. The header
    // and skip link are ahead of it, so a handful of presses is expected.
    let focused = false;
    for (let press = 0; press < 80; press += 1) {
      await page.keyboard.press('Tab');
      const activeHref = await page.evaluate(
        () => document.activeElement?.getAttribute('href') ?? null
      );
      if (activeHref === href) {
        focused = true;
        break;
      }
    }
    expect(focused).toBe(true);

    await page.waitForTimeout(700);
    const state = await measureCard(card);
    expect(state.revealOpacity).toBe(1);
    expect(state.overlayAlpha).toBeCloseTo(0.7, 2);
    expectInside(state.reveal, state.card, 'reveal');
    expectInside(state.text, state.card, 'hover text');
    expectInside(state.view, state.card, 'view pill');

    const outline = await card.evaluate((el) => {
      const style = getComputedStyle(el);
      return {
        style: style.outlineStyle,
        width: Number.parseFloat(style.outlineWidth),
      };
    });
    expect(outline.style).not.toBe('none');
    expect(outline.width).toBeGreaterThanOrEqual(1);
  });
}

test('ar: the arrow points left and the home grids carry the right copy', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });

  // Both home grids are call sites too: their reveal text has to be the
  // product copy in one section and the maintenance copy in the other.
  await page.goto(`${WEB_URL}/ar`);
  const homeProduct = page
    .locator('section[aria-labelledby="categories-heading"] li a')
    .first();
  await expect(
    homeProduct.locator('[data-testid="category-card-reveal"]')
  ).toContainText(COPY.ar.productHover);
  await expect(
    homeProduct.locator('[data-testid="category-card-reveal"]')
  ).toContainText(COPY.ar.view);
  const homeLine = page
    .locator('section[aria-labelledby="maintenance-categories-heading"] li a')
    .first();
  await expect(
    homeLine.locator('[data-testid="category-card-reveal"]')
  ).toContainText(COPY.ar.maintenanceHover);

  // The /maintenance index is the other maintenance call site.
  await page.goto(`${WEB_URL}/ar/maintenance`);
  const card = lineCard(page);
  await card.scrollIntoViewIfNeeded();
  await card.hover();
  await page.waitForTimeout(700);
  await expect(card.getByText(COPY.ar.maintenanceHover)).toBeVisible();

  // Drawn pointing right, mirrored by `rtl:[transform:scaleX(-1)]`.
  const transform = await card
    .locator('[data-testid="category-card-arrow"]')
    .evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');
});

test('en at 390 with touch: nothing is revealed and a tap navigates', async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  const page = await context.newPage();

  // Playwright has no first-class hover-media switch, so the device feature
  // is emulated directly. `hasTouch` alone is not enough: the CSS gate this
  // test exists to prove is `@media (hover: hover)`.
  const client = await context.newCDPSession(page);
  await client.send('Emulation.setEmulatedMedia', {
    media: 'screen',
    features: [
      { name: 'hover', value: 'none' },
      { name: 'pointer', value: 'coarse' },
    ],
  });

  await page.goto(`${WEB_URL}/en/categories`);
  expect(
    await page.evaluate(() => window.matchMedia('(hover: hover)').matches)
  ).toBe(false);

  const card = productCard(page);
  await card.scrollIntoViewIfNeeded();
  const state = await measureCard(card);
  expect(state.revealOpacity).toBe(0);
  expect(state.overlayAlpha).toBeCloseTo(0.6, 2);

  await card.tap();
  await page.waitForURL(
    new RegExp(
      `/en/categories/${PRODUCT_SLUG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`
    )
  );

  await context.close();
});
