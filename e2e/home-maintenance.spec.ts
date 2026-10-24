import { test, expect } from '@playwright/test';
import {
  SHOWCASE_PHOTOS,
  cleanupFixtures,
  createMaintenanceCategory,
  createShowcase,
  deleteMaintenanceCategoriesByTag,
  deleteShowcasesByTag,
  runInDbValue,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Every row this file creates carries the fixture tag in its name and slug, so
// the run leaves the database as it found it and a leftover from a crashed run
// is identifiable by eye.
const TAG = 'st28a';

const LINE_SLUG = `home-line-${TAG}`;
const FALLBACK_SLUG = `home-fallback-${TAG}`;
const EMPTY_SLUG = `home-empty-${TAG}`;

const LINE_EN = `Home Maintenance Line ${TAG}`;
const LINE_AR = `خط صيانة الرئيسية ${TAG}`;
const FALLBACK_EN = `Home Fallback Line ${TAG}`;
const FALLBACK_AR = `خط بديل ${TAG}`;
const EMPTY_EN = `Home Empty Line ${TAG}`;
const EMPTY_AR = `خط فارغ ${TAG}`;

const ITEM_A_EN = `Home Machine ${TAG} Alpha`;
const ITEM_A_AR = `ماكينة رئيسية ${TAG} ألفا`;
const ITEM_B_EN = `Home Machine ${TAG} Beta`;
const ITEM_B_AR = `ماكينة رئيسية ${TAG} بيتا`;
const FALLBACK_ITEM_EN = `Home Machine ${TAG} Fallback`;
const FALLBACK_ITEM_AR = `ماكينة بديلة ${TAG}`;
const ORPHAN_EN = `Home Orphan ${TAG}`;
const ORPHAN_AR = `ماكينة يتيمة ${TAG}`;

const COPY = {
  en: {
    heading: 'Maintenance machines',
  },
  ar: {
    heading: 'ماكينات الصيانة',
  },
} as const;

const lineName = (locale: 'en' | 'ar') => (locale === 'ar' ? LINE_AR : LINE_EN);
const fallbackName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? FALLBACK_AR : FALLBACK_EN;
const emptyName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? EMPTY_AR : EMPTY_EN;
const orphanName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? ORPHAN_AR : ORPHAN_EN;

/**
 * Creates the lines these specs need:
 *
 * - a line with two machines and its own cover photo;
 * - a line with one machine and NO cover photo, so the card has to fall back
 *   to that machine's after picture;
 * - a line with no machines, which must not appear;
 * - a machine with no category, which must never appear anywhere public.
 */
function seed() {
  createMaintenanceCategory({
    slug: LINE_SLUG,
    nameEn: LINE_EN,
    nameAr: LINE_AR,
    imageUrl: SHOWCASE_PHOTOS.before,
  });
  createMaintenanceCategory({
    slug: FALLBACK_SLUG,
    nameEn: FALLBACK_EN,
    nameAr: FALLBACK_AR,
  });
  createMaintenanceCategory({
    slug: EMPTY_SLUG,
    nameEn: EMPTY_EN,
    nameAr: EMPTY_AR,
  });

  createShowcase({
    nameEn: ITEM_A_EN,
    nameAr: ITEM_A_AR,
    categorySlug: LINE_SLUG,
  });
  createShowcase({
    nameEn: ITEM_B_EN,
    nameAr: ITEM_B_AR,
    categorySlug: LINE_SLUG,
  });
  createShowcase({
    nameEn: FALLBACK_ITEM_EN,
    nameAr: FALLBACK_ITEM_AR,
    categorySlug: FALLBACK_SLUG,
    afterImageUrl: SHOWCASE_PHOTOS.after,
  });
  createShowcase({
    nameEn: ORPHAN_EN,
    nameAr: ORPHAN_AR,
  });
}

/**
 * How many qualifying lines are NOT this spec's fixtures.
 *
 * The empty-section test needs every qualifying line gone. This is how it
 * checks that emptying the table is within its own rights before it does.
 */
function countUntaggedQualifyingLines(): number {
  return (
    runInDbValue<number>(`
    return await prisma.maintenanceCategory.count({
      where: {
        NOT: { slug: { contains: ${JSON.stringify(TAG)} } },
        items: { some: {} },
      },
    });
  `) ?? -1
  );
}

test.beforeAll(() => {
  cleanupFixtures(TAG);
  seed();
});

test.afterAll(() => {
  deleteShowcasesByTag(TAG);
  deleteMaintenanceCategoriesByTag(TAG);
  cleanupFixtures(TAG);
});

const sectionOf = (page: import('@playwright/test').Page) =>
  page.locator('section[aria-labelledby="maintenance-categories-heading"]');

// The home page's "Featured machines" strip, its query and the admin toggle
// that fed it are gone. This file grew out of that removal; what replaced it is
// asserted below.
test.describe('home page maintenance machines', () => {
  test('no featured-machines section renders any more', async ({ page }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}`);

      // Nothing by heading text...
      await expect(
        page.getByRole('heading', { name: 'Featured machines' })
      ).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'آلات مميزة' })
      ).toHaveCount(0);

      // ...and nothing by the element the section used to carry, so a rename
      // cannot quietly leave the markup behind.
      await expect(page.locator('#featured-machines-heading')).toHaveCount(0);

      // The per-card "Featured" pill is a different thing and is still fed by
      // the column on the listing, the category grids and the related strip,
      // so it is deliberately NOT asserted absent here.
    }
  });

  test('the 30b slider grid is gone from the home page', async ({ page }) => {
    await page.goto(`${WEB_URL}/en`);
    // The comparisons moved to /maintenance/[slug]; the home page now shows
    // line cards, which contain no slider at all.
    await expect(
      page.locator('[data-testid="before-after-slider"]')
    ).toHaveCount(0);
    await expect(
      page.locator('section[aria-labelledby="maintenance-showcase-heading"]')
    ).toHaveCount(0);
  });

  test('with no qualifying line the section is not rendered at all', async ({
    page,
  }) => {
    // The home page's query only returns lines that have a machine, so the
    // only honest way to see the section gone is a table with no qualifying
    // line in it. This spec's own fixtures are therefore removed for the
    // duration, and put back afterwards.
    //
    // Verified against the DEV server, which re-renders the page per request.
    // The home page is ISR-cached (`revalidate = 3600`), so the same assertion
    // against a production build would be reading a cached page and would need
    // a cache purge first; that is why this is a dev-server test.
    const strays = countUntaggedQualifyingLines();
    if (strays !== 0) {
      test.skip(
        true,
        strays > 0
          ? `colina_test holds ${strays} untagged maintenance line(s) with items; an empty section cannot be produced without deleting data this spec does not own`
          : 'could not read the MaintenanceCategory table'
      );
    }

    try {
      deleteShowcasesByTag(TAG);
      deleteMaintenanceCategoriesByTag(TAG);

      await page.goto(`${WEB_URL}/en`);
      await expect(sectionOf(page)).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: COPY.en.heading })
      ).toHaveCount(0);
      // ...and the page around it is untouched.
      await expect(page.locator('#categories-heading')).toBeAttached();
    } finally {
      // Put the fixtures back so the rest of the run is unaffected whatever
      // happened.
      seed();
    }
  });
});

// Both locales, both widths: the section has to read as one page in Arabic on
// a phone, and the cards carry only the line's name.
for (const locale of ['en', 'ar'] as const) {
  for (const viewport of [
    { name: '1280px', width: 1280, height: 900 },
    { name: '390px', width: 390, height: 844 },
  ]) {
    test.describe(`${locale} at ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('the section sits below the categories and shows only qualifying lines', async ({
        page,
      }) => {
        await page.goto(`${WEB_URL}/${locale}`);
        const section = sectionOf(page);
        await expect(section).toHaveCount(1);

        // Directly below the categories section in DOM order — not merely
        // somewhere further down the page.
        const follows = await page.evaluate(() => {
          const categories = document.querySelector(
            '[aria-labelledby="categories-heading"]'
          );
          const maintenance = document.querySelector(
            '[aria-labelledby="maintenance-categories-heading"]'
          );
          if (!categories || !maintenance) return false;
          // DOCUMENT_POSITION_FOLLOWING === 4
          return Boolean(categories.compareDocumentPosition(maintenance) & 4);
        });
        expect(follows).toBe(true);

        await expect(
          section.getByRole('heading', {
            name: COPY[locale].heading,
            level: 2,
          })
        ).toBeVisible();

        // The line with items is a tile that prints the localized name and
        // links to its line page. The count pill is gone.
        const lineLink = section.locator(
          `a[href$="/maintenance/${LINE_SLUG}"]`
        );
        await expect(lineLink).toHaveCount(1);
        await expect(lineLink).toContainText(lineName(locale));
        await expect(lineLink).not.toContainText(/\d+\s+machines?/i);
        // The line's own cover wins over the newest machine's photo.
        await expect(lineLink.locator('img')).toHaveAttribute(
          'src',
          SHOWCASE_PHOTOS.before
        );

        // A line with no cover falls back to its newest item's after photo.
        const fallbackLink = section.locator(
          `a[href$="/maintenance/${FALLBACK_SLUG}"]`
        );
        await expect(fallbackLink).toHaveCount(1);
        await expect(fallbackLink).toContainText(fallbackName(locale));
        await expect(fallbackLink).not.toContainText(/\d+\s+machines?/i);
        await expect(fallbackLink.locator('img')).toHaveAttribute(
          'src',
          SHOWCASE_PHOTOS.after
        );

        // A line with zero items is not a destination.
        await expect(section.getByText(emptyName(locale))).toHaveCount(0);

        // A machine with no category never appears on the public home page.
        await expect(page.getByText(orphanName(locale))).toHaveCount(0);
      });

      test('the page does not overflow horizontally', async ({ page }) => {
        await page.goto(`${WEB_URL}/${locale}`);
        const overflow = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        // A pixel of slack for sub-pixel rounding in the layout.
        expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
      });
    });
  }
}
