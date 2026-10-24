import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMaintenanceCategory,
  createShowcase,
  deleteMaintenanceCategoriesByTag,
  deleteShowcasesByTag,
  runInDbValue,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

const TAG = 'st28a';
const STAMP = `${TAG}-${Date.now().toString(36)}`;

const COPY = {
  en: {
    productViewAll: 'View all product categories',
    maintenanceViewAll: 'View all maintenance categories',
  },
  ar: {
    productViewAll: 'عرض كل أقسام المنتجات',
    maintenanceViewAll: 'عرض كل أقسام الصيانة',
  },
} as const;

type Locale = keyof typeof COPY;

const VIEWPORTS = [
  { name: '1280px', width: 1280, height: 900 },
  { name: '390px', width: 390, height: 844 },
] as const;

const lineSlug = (index: number) => `cap-line-${index}-${STAMP}`;
const lineName = (locale: Locale, index: number) =>
  locale === 'ar' ? `خط السعة ${index} ${STAMP}` : `Cap Line ${index} ${STAMP}`;
const emptySlug = `cap-empty-${STAMP}`;
const emptyName = (locale: Locale) =>
  locale === 'ar' ? `خط فارغ ${STAMP}` : `Empty Cap Line ${STAMP}`;

const productSlug = (index: number) => `cap-product-${index}-${STAMP}`;
const productName = (locale: Locale, index: number) =>
  locale === 'ar'
    ? `فئة السعة ${index} ${STAMP}`
    : `Cap Category ${index} ${STAMP}`;

const productSection = (page: Page) =>
  page.locator('section[aria-labelledby="categories-heading"]');
const maintenanceSection = (page: Page) =>
  page.locator('section[aria-labelledby="maintenance-categories-heading"]');

function countUntaggedCategories(): number {
  return (
    runInDbValue<number>(`
    return await prisma.machineCategory.count({
      where: { NOT: { slug: { contains: ${JSON.stringify(TAG)} } } },
    });
  `) ?? -1
  );
}

function createLine(index: number) {
  createMaintenanceCategory({
    slug: lineSlug(index),
    nameEn: lineName('en', index),
    nameAr: lineName('ar', index),
    sortOrder: index,
  });
  createShowcase({
    nameEn: `Cap Machine ${index} ${STAMP}`,
    nameAr: `ماكينة السعة ${index} ${STAMP}`,
    categorySlug: lineSlug(index),
  });
}

/** Six qualifying lines plus one line with no machine, which must not count. */
function seedSixLines() {
  for (let index = 1; index <= 6; index += 1) {
    createLine(index);
  }
  createMaintenanceCategory({
    slug: emptySlug,
    nameEn: emptyName('en'),
    nameAr: emptyName('ar'),
    sortOrder: 99,
  });
}

let baseProductCount = 0;

test.beforeAll(() => {
  cleanupFixtures(TAG);
  baseProductCount = countUntaggedCategories();
});

test.afterAll(() => {
  deleteShowcasesByTag(TAG);
  deleteMaintenanceCategoriesByTag(TAG);
  cleanupFixtures(TAG);
});

/**
 * The card's visible text must be its name plus the hidden hover copy and the
 * "View" label — no count pill, and no count folded into the accessible name.
 */
async function expectNoCounts(cards: Locator) {
  const count = await cards.count();
  expect(count).toBeGreaterThan(0);
  for (let index = 0; index < count; index += 1) {
    const card = cards.nth(index);
    const label = await card.getAttribute('aria-label');
    const heading = ((await card.locator('h3').textContent()) ?? '').trim();
    expect(label).toBe(heading);

    const text = ((await card.textContent()) ?? '').trim();
    // Counts are always "N machines" or an Arabic plural with a digit, plus
    // the two digitless Arabic branches. Matching bare nouns would hit real
    // category names such as "آلات التغليف" (Packaging Machines).
    expect(text).not.toMatch(/\d+\s*machines?/i);
    expect(text).not.toMatch(/\d+\s*(?:ماكينة|ماكينات|آلة|آلات)/);
    expect(text).not.toContain('ماكينة واحدة');
    expect(text).not.toContain('ماكينتان');
    expect(text).not.toContain('لا توجد ماكينات');
    expect(text).not.toContain('No machines');
  }
}

async function expectNoOverflow(page: Page) {
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
}

test.describe('maintenance section with six qualifying lines', () => {
  test.beforeAll(() => {
    seedSixLines();
  });

  for (const locale of ['en', 'ar'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${locale} at ${viewport.name}: six cards and no view-all`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`${WEB_URL}/${locale}`);

        const section = maintenanceSection(page);
        await expect(section).toHaveCount(1);
        const cards = section.locator('li a');
        await expect(cards).toHaveCount(6);

        // Six qualifying lines is not "more than six": no button, no gap.
        await expect(
          section.getByRole('link', { name: COPY[locale].maintenanceViewAll })
        ).toHaveCount(0);

        // The zero-machine line never counts towards the six.
        await expect(page.getByText(emptyName(locale))).toHaveCount(0);
        await expectNoCounts(cards);
        await expectNoOverflow(page);
      });
    }
  }
});

test.describe('maintenance section with seven qualifying lines', () => {
  test.beforeAll(() => {
    createLine(7);
  });

  for (const locale of ['en', 'ar'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${locale} at ${viewport.name}: six cards and a view-all to all seven`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`${WEB_URL}/${locale}`);

        const section = maintenanceSection(page);
        const cards = section.locator('li a');
        await expect(cards).toHaveCount(6);

        const button = section.getByRole('link', {
          name: COPY[locale].maintenanceViewAll,
        });
        await expect(button).toBeVisible();
        await expect(button).toHaveAttribute('href', `/${locale}/maintenance`);

        // The empty line is still not a destination.
        await expect(page.getByText(emptyName(locale))).toHaveCount(0);
        await expectNoCounts(cards);

        await button.click();
        await page.waitForURL(`${WEB_URL}/${locale}/maintenance`);

        // The index is uncapped: every qualifying line, including the seventh.
        for (let index = 1; index <= 7; index += 1) {
          await expect(
            page.locator(`a[href$="/maintenance/${lineSlug(index)}"]`)
          ).toHaveCount(1);
        }
        await expect(page.getByText(emptyName(locale))).toHaveCount(0);
        await expectNoOverflow(page);
      });
    }
  }

  test('ar: the view-all pill is a link whose arrow mirrors', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/ar`);

    const button = maintenanceSection(page).getByRole('link', {
      name: COPY.ar.maintenanceViewAll,
    });
    await expect(button).toBeVisible();
    expect(await button.evaluate((el) => el.tagName)).toBe('A');
    await expect(button).toHaveAttribute('href', '/ar/maintenance');

    const transform = await button
      .getByTestId('view-all-arrow')
      .evaluate((el) => getComputedStyle(el).transform);
    expect(transform).toBe('matrix(-1, 0, 0, 1, 0, 0)');
  });
});

test.describe('product section at the database count', () => {
  for (const locale of ['en', 'ar'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${locale} at ${viewport.name}: cards and button match the database`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`${WEB_URL}/${locale}`);

        const section = productSection(page);
        const cards = section.locator('li a');
        await expect(cards).toHaveCount(Math.min(baseProductCount, 6));

        const button = section.getByRole('link', {
          name: COPY[locale].productViewAll,
        });
        if (baseProductCount > 6) {
          await expect(button).toBeVisible();
        } else {
          await expect(button).toHaveCount(0);
        }

        await expectNoCounts(cards);
        await expectNoOverflow(page);
      });
    }
  }
});

test.describe('product section with more than six rows', () => {
  test.beforeAll(() => {
    const needed = Math.max(1, 7 - baseProductCount);
    for (let index = 1; index <= needed; index += 1) {
      createCategory({
        slug: productSlug(index),
        nameEn: productName('en', index),
        nameAr: productName('ar', index),
      });
    }
  });

  for (const locale of ['en', 'ar'] as const) {
    for (const viewport of VIEWPORTS) {
      test(`${locale} at ${viewport.name}: six cards and a view-all to the full index`, async ({
        page,
      }) => {
        await page.setViewportSize({
          width: viewport.width,
          height: viewport.height,
        });
        await page.goto(`${WEB_URL}/${locale}`);

        const section = productSection(page);
        const cards = section.locator('li a');
        await expect(cards).toHaveCount(6);

        const button = section.getByRole('link', {
          name: COPY[locale].productViewAll,
        });
        await expect(button).toBeVisible();
        await expect(button).toHaveAttribute('href', `/${locale}/categories`);

        await expectNoCounts(cards);

        await button.click();
        await page.waitForURL(`${WEB_URL}/${locale}/categories`);

        // The index lists every category, the fixtures included.
        const total = baseProductCount + Math.max(1, 7 - baseProductCount);
        const indexCards = page.locator(
          `main ul li a[href^="/${locale}/categories/"]`
        );
        await expect(indexCards).toHaveCount(total);
        await expect(
          page.locator(`a[href$="/categories/${productSlug(1)}"]`)
        ).toHaveCount(1);
        await expectNoCounts(indexCards);
        await expectNoOverflow(page);
      });
    }
  }
});

test('after cleanup the home rules match the database again', async ({
  page,
}) => {
  deleteShowcasesByTag(TAG);
  deleteMaintenanceCategoriesByTag(TAG);
  cleanupFixtures(TAG);

  const count = countUntaggedCategories();
  expect(count).toBe(baseProductCount);

  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${WEB_URL}/en`);

  const section = productSection(page);
  await expect(section.locator('li a')).toHaveCount(Math.min(count, 6));

  const button = section.getByRole('link', {
    name: COPY.en.productViewAll,
  });
  if (count > 6) {
    await expect(button).toBeVisible();
  } else {
    await expect(button).toHaveCount(0);
  }

  // Every qualifying line is gone, so the maintenance section is gone too.
  await expect(maintenanceSection(page)).toHaveCount(0);
});
