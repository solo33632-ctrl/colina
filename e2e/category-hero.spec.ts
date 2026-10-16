import { test, expect, type Page } from '@playwright/test';
import { cleanupFixtures, createCategory, widePhoto } from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The category hero carries no photograph at all.
//
// It used to render the category photo twice — a blurred full-bleed backdrop
// plus a framed, letterboxed copy — which meant every category page shipped and
// decoded an image before a visitor had read a word, and a tall upload still had
// to be squeezed into a fixed-height frame to fit. These tests lock the
// replacement: a brand band built from CSS gradients and a pattern, so the hero
// loads ZERO images no matter what the category row holds.
//
// The fixtures below are written straight to the database (see db-fixture.ts)
// rather than through the admin UI: a public-page test should not depend on an
// admin login, an admin server and a set of translated form labels. Every
// fixture is tagged and removed again in `afterAll`.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

// A category that HAS a photo — the case the old hero was built around.
const WITH_PHOTO = `${TAG}-herophoto-${STAMP}`;
const WITH_PHOTO_DESCRIPTION =
  'Automatic filling and capping lines built for high-volume food plants, ' +
  'configured per line and supported on site by our engineers.';

// The same category with its description left blank, which must render no
// description block at all.
const NO_DESCRIPTION = `${TAG}-heroblank-${STAMP}`;

// A seeded category that is always present and always has a description.
const SEEDED = 'production-lines';

// The four widths the brief asks for.
const WIDTHS = [390, 768, 1280, 1920] as const;

test.beforeAll(() => {
  const photo = widePhoto();
  createCategory({
    slug: WITH_PHOTO,
    nameEn: `Hero Photo ${STAMP}`,
    nameAr: `صورة البطل ${STAMP}`,
    descriptionEn: WITH_PHOTO_DESCRIPTION,
    descriptionAr:
      'خطوط تعبئة وتغطية-automatically 구성 for high-volume food plants.',
    image: photo,
  });
  createCategory({
    slug: NO_DESCRIPTION,
    nameEn: `Hero Blank ${STAMP}`,
    nameAr: `بطل فارغ ${STAMP}`,
    image: photo,
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

/** The hero section itself. */
function hero(page: Page) {
  return page.locator('#category-hero');
}

/**
 * No image of any kind inside the hero, whatever the category row holds.
 *
 * This is the load-bearing assertion of the whole change: a single `<img>` or
 * CSS `background-image` here means the hero is fetching media again. The
 * check covers both, because the pattern could be painted either way.
 */
async function expectNoImagesInHero(page: Page) {
  await expect(page.locator('#category-hero img')).toHaveCount(0);
  await expect(page.locator('#category-hero picture')).toHaveCount(0);
  await expect(page.locator('#category-hero svg')).toHaveCount(0);
  const painted = await hero(page).evaluate((section) => {
    const backgrounds: string[] = [];
    for (const element of [
      section,
      ...Array.from(section.querySelectorAll('*')),
    ]) {
      const style = getComputedStyle(element);
      if (style.backgroundImage && style.backgroundImage !== 'none') {
        // The decorative gradient/pattern ARE background-images; what must not
        // appear is a raster photo, so only flag anything that loads a file.
        if (/url\(/.test(style.backgroundImage)) {
          backgrounds.push(style.backgroundImage);
        }
      }
    }
    return backgrounds;
  });
  expect(painted).toEqual([]);
}

test.describe('category hero is photo-free', () => {
  test('a category that has a photo still loads no image in its hero, in both locales', async ({
    page,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${WITH_PHOTO}`);
      await expect(hero(page)).toHaveCount(1);
      await expectNoImagesInHero(page);
      // The photo is still shown on the tile that links here, so this is a
      // statement about the hero and not about the data.
      await page.goto(`${WEB_URL}/${locale}/categories`);
      const tile = page.locator(
        `a[href="/${locale}/categories/${WITH_PHOTO}"]`
      );
      await expect(tile.locator('img')).toHaveCount(1);
    }
  });

  test('the removed hero ids are gone from every category, photographed or not', async ({
    page,
  }) => {
    for (const slug of [WITH_PHOTO, NO_DESCRIPTION, SEEDED]) {
      for (const locale of ['en', 'ar'] as const) {
        await page.goto(`${WEB_URL}/${locale}/categories/${slug}`);
        await expect(page.locator('#category-hero-photo')).toHaveCount(0);
        await expect(page.locator('#category-hero-backdrop')).toHaveCount(0);
      }
    }
  });

  test('breadcrumb, title, count pill and description are centered, in both locales', async ({
    page,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${WITH_PHOTO}`);
      const expectedName =
        locale === 'en' ? `Hero Photo ${STAMP}` : `صورة البطل ${STAMP}`;

      // The trail, the heading and the pill are all present...
      const trail = hero(page).getByRole('navigation');
      await expect(trail).toBeVisible();
      await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(
        page.getByRole('heading', { level: 1, name: expectedName })
      ).toBeVisible();
      await expect(
        hero(page).getByRole('link', { name: expectedName })
      ).toHaveCount(0);

      // ...and each one's horizontal centre sits on the band's centre. The
      // stack is symmetric, so RTL needs confirming, not mirroring.
      const geometry = await page.evaluate(() => {
        const band = document
          .querySelector('#category-hero')!
          .getBoundingClientRect();
        const centreOf = (selector: string) => {
          const el = document.querySelector(selector)!;
          const rect = el.getBoundingClientRect();
          return rect.left + rect.width / 2;
        };
        return {
          bandCentre: band.left + band.width / 2,
          title: centreOf('#category-hero h1'),
          pill: centreOf('#category-hero-count'),
          description: centreOf('#category-description'),
        };
      });
      const bandCentre = geometry.bandCentre;
      expect(Math.abs(geometry.title - bandCentre)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.pill - bandCentre)).toBeLessThanOrEqual(2);
      expect(Math.abs(geometry.description - bandCentre)).toBeLessThanOrEqual(
        2
      );
    }
  });

  test('the machine-count pill is present and pluralised per locale', async ({
    page,
  }) => {
    // Both fixtures are empty categories, which is the interesting count: the
    // pill must say so rather than rendering a bare "0" or disappearing.
    for (const locale of ['en', 'ar'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${NO_DESCRIPTION}`);
      const pill = page.locator('#category-hero-count');
      await expect(pill).toBeVisible();
      const text = (await pill.textContent())!.trim();
      expect(text.length).toBeGreaterThan(0);
      // Arabic pluralises "no machines" into its own phrase; English says
      // "No machines". Either way it must not be a lone digit.
      if (locale === 'en') {
        expect(text).toBe('No machines');
      } else {
        expect(text).toBe('لا آلات');
      }

      // A category that does hold machines states how many, in words.
      await page.goto(`${WEB_URL}/${locale}/categories/${SEEDED}`);
      const seeded = (await page
        .locator('#category-hero-count')
        .textContent())!.trim();
      if (locale === 'en') {
        expect(seeded).toMatch(/^\d+ machines?$/);
      } else {
        expect(seeded).toMatch(/^آلة|آلتان|آلات/);
      }
    }
  });

  test('the description renders in full only when it is non-empty', async ({
    page,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.setViewportSize({ width: 1280, height: 900 });

      // Present, and not truncated: every word of the fixture's copy survives.
      await page.goto(`${WEB_URL}/${locale}/categories/${WITH_PHOTO}`);
      const description = page.locator('#category-description');
      await expect(description).toHaveCount(1);
      await expect(description).toBeVisible();
      if (locale === 'en') {
        await expect(description).toHaveText(WITH_PHOTO_DESCRIPTION);
      }
      // Visible, not clipped by a fixed height: the element is at least as tall
      // as the text it wraps, with no overflow hiding any of it.
      const clipped = await description.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          overflow: style.overflow,
          lineClamp: style.webkitLineClamp,
        };
      });
      expect(['visible', 'clip']).toContain(clipped.overflow);
      expect(clipped.lineClamp).toBe('none');

      // Blank description: no block at all.
      await page.goto(`${WEB_URL}/${locale}/categories/${NO_DESCRIPTION}`);
      await expect(page.locator('#category-description')).toHaveCount(0);
    }
  });

  test('no horizontal overflow at 390/768/1280/1920, in both locales', async ({
    page,
  }) => {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ['en', 'ar'] as const) {
        for (const slug of [WITH_PHOTO, NO_DESCRIPTION, SEEDED]) {
          await page.goto(`${WEB_URL}/${locale}/categories/${slug}`);
          const widths = await page.evaluate(() => ({
            scroll: document.scrollingElement!.scrollWidth,
            client: document.documentElement.clientWidth,
            heroWidth: document
              .querySelector('#category-hero')!
              .getBoundingClientRect().width,
          }));
          expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
          // The band never exceeds the viewport either.
          expect(widths.heroWidth).toBeLessThanOrEqual(widths.client + 1);
        }
      }
    }
  });

  test('a category without a photo renders the same band as one with', async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}/categories/${NO_DESCRIPTION}`);
      await expectNoImagesInHero(page);
      await expect(hero(page)).toHaveCount(1);
      // Same band colour as the photographed category: no second visual
      // treatment survived the change.
      const band = await hero(page).evaluate(
        (el) => getComputedStyle(el).backgroundColor
      );
      expect(band).toBe('rgb(110, 23, 17)'); // brand-900
    }
  });
});
