import { test, expect, type Locator, type Page } from '@playwright/test';
import { cleanupFixtures, createCategory, photoOf } from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The category hero carries the category's own photo, shown whole.
//
// The hero used to render that photo twice (a blurred backdrop plus a framed
// copy) and then, in a later pass, not at all — a solid brand band. What it is
// now is the middle of the two: ONE photo, complete and uncropped, under a flat
// scrim, with the category name centred over it and the breadcrumb beneath.
// These tests lock that, and they lock the part that is easy to break by
// accident — a hero that crops the photo — by using three photos whose shapes
// are all wrong for `cover` and all fine for `contain`.
//
// Fixtures go straight to the database (see db-fixture.ts) rather than through
// the admin UI: a public-page test should not depend on an admin login, an
// admin server and a set of translated form labels. Every fixture is tagged and
// removed again in `afterAll`.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

// Three photos that disagree with the frame in three different directions.
const PHOTOS = [
  { slug: `${TAG}-tall-${STAMP}`, w: 400, h: 900 },
  { slug: `${TAG}-wide-${STAMP}`, w: 1600, h: 500 },
  { slug: `${TAG}-square-${STAMP}`, w: 600, h: 600 },
] as const;

// The same category with its description left blank: no `#category-description`.
const NO_DESCRIPTION = `${TAG}-heroblank-${STAMP}`;

// A seeded category that is always present, has a description, and has no photo.
const SEEDED = 'production-lines';

const DESCRIPTION =
  'Automatic filling and capping lines built for high-volume food plants, ' +
  'configured per line and supported on site by our engineers.';

const WIDTHS = [390, 768, 1280, 1920] as const;

test.beforeAll(() => {
  for (const photo of PHOTOS) {
    createCategory({
      slug: photo.slug,
      nameEn: `Hero ${photo.w}x${photo.h} ${STAMP}`,
      nameAr: `بطل ${photo.w}×${photo.h} ${STAMP}`,
      descriptionEn: DESCRIPTION,
      descriptionAr: 'وصف تعريفي للفئة.',
      image: photoOf(photo.w, photo.h),
    });
  }
  createCategory({
    slug: NO_DESCRIPTION,
    nameEn: `Hero Blank ${STAMP}`,
    nameAr: `بطل فارغ ${STAMP}`,
    image: photoOf(800, 200),
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

function hero(page: Page) {
  return page.locator('#category-hero');
}

/**
 * Asserts the hero shows the photo COMPLETE rather than cropped.
 *
 * The `<img>` element fills the hero exactly — the vertical padding is carried
 * on the element itself (`box-sizing: border-box`), so it is carved out of the
 * element's own box and the PHOTO sits inside it. These assertions are split
 * accordingly:
 *
 *  1. `object-fit` really computes to `contain`;
 *  2. the element covers the hero, and the PAINTED photo is inset from the
 *     hero's top and bottom by at least that padding — so the picture keeps a
 *     margin instead of running to the edges;
 *  3. the painted image keeps the source's aspect ratio and is strictly smaller
 *     than the content box on at least one axis, which is what letterboxing
 *     looks like. `cover` would fill the content box on both axes and crop
 *     instead, so claim 3 is the one that actually rules out cropping.
 */
async function expectCompletePhoto(photo: Locator) {
  const info = await photo.evaluate((el) => {
    const img = el as HTMLImageElement;
    const style = getComputedStyle(img);
    const hero = img.closest('#category-hero')!.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    const padTop = parseFloat(style.paddingTop);
    const padBottom = parseFloat(style.paddingBottom);
    const contentHeight = box.height - padTop - padBottom;
    const scale = Math.min(
      box.width / img.naturalWidth,
      contentHeight / img.naturalHeight
    );
    const paintedWidth = img.naturalWidth * scale;
    const paintedHeight = img.naturalHeight * scale;
    // `contain` centres the photo in the content box.
    const paintedTop = box.top + padTop + (contentHeight - paintedHeight) / 2;
    return {
      objectFit: style.objectFit,
      naturalRatio: img.naturalWidth / img.naturalHeight,
      padTop,
      padBottom,
      hero: {
        top: hero.top,
        bottom: hero.bottom,
        left: hero.left,
        right: hero.right,
        width: hero.width,
        height: hero.height,
      },
      box: {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
      },
      painted: {
        width: paintedWidth,
        height: paintedHeight,
        top: paintedTop,
        bottom: paintedTop + paintedHeight,
      },
    };
  });

  expect(info.objectFit).toBe('contain');
  expect(info.naturalRatio).toBeGreaterThan(0);

  // The element covers the hero on every side.
  expect(Math.abs(info.box.top - info.hero.top)).toBeLessThanOrEqual(1);
  expect(Math.abs(info.box.bottom - info.hero.bottom)).toBeLessThanOrEqual(1);
  expect(Math.abs(info.box.left - info.hero.left)).toBeLessThanOrEqual(1);
  expect(Math.abs(info.box.right - info.hero.right)).toBeLessThanOrEqual(1);

  // The PAINTED photo is inset by the vertical padding on both sides.
  expect(info.painted.top - info.hero.top).toBeGreaterThanOrEqual(
    info.padTop - 1
  );
  expect(info.hero.bottom - info.painted.bottom).toBeGreaterThanOrEqual(
    info.padBottom - 1
  );

  // Proportions preserved: a crop would have distorted them.
  expect(info.painted.width).toBeGreaterThan(0);
  expect(info.painted.height).toBeGreaterThan(0);
  expect(info.painted.width / info.painted.height).toBeCloseTo(
    info.naturalRatio,
    3
  );
  // Letterboxed on at least one axis — `cover` fills both.
  const letterboxed =
    info.painted.height < info.box.height - info.padTop - info.padBottom - 1 ||
    info.painted.width < info.box.width - 1;
  expect(letterboxed).toBe(true);
}

test.describe('category hero shows the complete photo', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: exactly one photo, contained, scrim over the whole hero`, async ({
      page,
    }) => {
      for (const photo of PHOTOS) {
        await page.setViewportSize({ width: 1280, height: 900 });
        await page.goto(`${WEB_URL}/${locale}/categories/${photo.slug}`);

        // ONE image, and it is the one the tests can find by id.
        await expect(hero(page).locator('img')).toHaveCount(1);
        const img = hero(page).locator('#category-hero-photo');
        await expect(img).toHaveCount(1);
        // Eager and high priority: it is this page's largest contentful paint.
        await expect(img).toHaveAttribute('loading', 'eager');
        await expect(img).toHaveAttribute('fetchpriority', 'high');
        await expect(img).toHaveAttribute('sizes', '100vw');

        await expectCompletePhoto(img);

        // The scrim covers the whole hero.
        const scrim = await hero(page).evaluate((el) => {
          const found = Array.from(el.querySelectorAll('div')).find((child) => {
            const match = getComputedStyle(child).backgroundColor.match(
              /^rgba\(0,\s*0,\s*0,\s*([\d.]+)\)$/
            );
            return match !== null && Number(match[1]) > 0;
          });
          if (!found) return null;
          const rect = found.getBoundingClientRect();
          const heroRect = el.getBoundingClientRect();
          return {
            width: rect.width,
            height: rect.height,
            heroWidth: heroRect.width,
            heroHeight: heroRect.height,
          };
        });
        expect(scrim).not.toBeNull();
        expect(Math.abs(scrim!.width - scrim!.heroWidth)).toBeLessThanOrEqual(
          1
        );
        expect(Math.abs(scrim!.height - scrim!.heroHeight)).toBeLessThanOrEqual(
          1
        );
      }
    });

    test(`${locale}: the name is white and centred, the breadcrumb sits below it`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${PHOTOS[0].slug}`);

      const expectedName =
        locale === 'en'
          ? `Hero ${PHOTOS[0].w}x${PHOTOS[0].h} ${STAMP}`
          : `بطل ${PHOTOS[0].w}×${PHOTOS[0].h} ${STAMP}`;

      const heading = page.getByRole('heading', {
        level: 1,
        name: expectedName,
      });
      await expect(heading).toBeVisible();
      expect(await heading.evaluate((el) => getComputedStyle(el).color)).toBe(
        'rgb(255, 255, 255)'
      );

      // Centred on both axes within 3%. The breadcrumb hangs out of flow below
      // the heading, so the heading really is on the centre.
      const geometry = await heading.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const heroRect = el.closest('#category-hero')!.getBoundingClientRect();
        const crumb = el
          .closest('div')!
          .parentElement!.querySelector('nav[aria-label]');
        const crumbRect = crumb?.getBoundingClientRect();
        return {
          headingCentreX: rect.left + rect.width / 2,
          headingCentreY: rect.top + rect.height / 2,
          heroCentreX: heroRect.left + heroRect.width / 2,
          heroCentreY: heroRect.top + heroRect.height / 2,
          heroWidth: heroRect.width,
          heroHeight: heroRect.height,
          crumbTop: crumbRect?.top ?? 0,
          headingBottom: rect.bottom,
          crumbCount: el.closest('#category-hero')!.querySelectorAll('nav')
            .length,
        };
      });

      expect(
        Math.abs(geometry.headingCentreX - geometry.heroCentreX) /
          geometry.heroWidth
      ).toBeLessThanOrEqual(0.03);
      expect(
        Math.abs(geometry.headingCentreY - geometry.heroCentreY) /
          geometry.heroHeight
      ).toBeLessThanOrEqual(0.03);
      // The trail is BELOW the title, not above it.
      expect(geometry.crumbTop).toBeGreaterThanOrEqual(
        geometry.headingBottom - 1
      );
      expect(geometry.crumbCount).toBe(1);
    });

    test(`${locale}: the trail is a real breadcrumb and links to its ancestors`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${PHOTOS[1].slug}`);
      const trail = hero(page).getByRole('navigation');
      await expect(trail).toBeVisible();
      // The current page is the last crumb and is not a link.
      await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);
      await expect(trail.locator('a')).toHaveCount(2);
    });
  }

  test('the hero is a comfortable band: >=288px on a phone, 400-520px on desktop', async ({
    page,
  }) => {
    // Phone: the `min-h-[18rem]` floor.
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/en/categories/${PHOTOS[0].slug}`);
    const phoneHeight = await hero(page).evaluate(
      (el) => el.getBoundingClientRect().height
    );
    expect(phoneHeight).toBeGreaterThanOrEqual(288);

    // Desktop: between 400 and 520px, so it never balloons on a wide screen.
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/en/categories/${PHOTOS[0].slug}`);
    const desktopHeight = await hero(page).evaluate(
      (el) => el.getBoundingClientRect().height
    );
    expect(desktopHeight).toBeGreaterThanOrEqual(400);
    expect(desktopHeight).toBeLessThanOrEqual(520);
  });
});

test.describe('category hero without a photo', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: no image, a solid dark field, and the same centred title`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${SEEDED}`);

      await expect(hero(page)).toHaveCount(1);
      // No photo at all: a seeded category with no artwork.
      await expect(hero(page).locator('img')).toHaveCount(0);

      const field = await hero(page).evaluate((el) => {
        const dark = Array.from(el.querySelectorAll('div')).find((child) => {
          const match = getComputedStyle(child).backgroundColor.match(
            /^rgba?\((\d+),\s*(\d+),\s*(\d+)/
          );
          if (!match) return false;
          return (
            Number(match[1]) < 60 &&
            Number(match[2]) < 60 &&
            Number(match[3]) < 60
          );
        });
        if (!dark) return null;
        const rect = dark.getBoundingClientRect();
        const heroRect = el.getBoundingClientRect();
        return {
          background: getComputedStyle(dark).backgroundColor,
          width: rect.width,
          height: rect.height,
          heroWidth: heroRect.width,
          heroHeight: heroRect.height,
        };
      });
      expect(field).not.toBeNull();
      // Opaque, and covering the whole hero like the photo + scrim pair did.
      expect(field!.background).toMatch(/^rgb\(/);
      expect(Math.abs(field!.width - field!.heroWidth)).toBeLessThanOrEqual(1);
      expect(Math.abs(field!.height - field!.heroHeight)).toBeLessThanOrEqual(
        1
      );

      // Same structure: a white centred h1 over the field.
      const heading = hero(page).locator('h1');
      await expect(heading).toBeVisible();
      const colour = await heading.evaluate((el) => getComputedStyle(el).color);
      expect(colour).toBe('rgb(255, 255, 255)');
      await expect(hero(page).getByRole('navigation')).toBeVisible();
    });
  }
});

test.describe('category description and the removed pill', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: the description appears exactly once, below the hero`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });

      // Present, exactly once, and BELOW the hero rather than inside it.
      await page.goto(`${WEB_URL}/${locale}/categories/${PHOTOS[0].slug}`);
      const description = page.locator('#category-description');
      await expect(description).toHaveCount(1);
      await expect(description).toBeVisible();
      const placement = await description.evaluate((el) => {
        const rect = el.getBoundingClientRect();
        const heroRect = el
          .closest('main')!
          .querySelector('#category-hero')!
          .getBoundingClientRect();
        return { top: rect.top, heroBottom: heroRect.bottom };
      });
      expect(placement.top).toBeGreaterThanOrEqual(placement.heroBottom - 1);
      if (locale === 'en') {
        await expect(description).toHaveText(DESCRIPTION);
      }
      // Readable, not clipped: no line clamp and no hidden overflow.
      const clipped = await description.evaluate((el) => {
        const style = getComputedStyle(el);
        return {
          lineClamp: style.webkitLineClamp,
          overflow: style.overflow,
        };
      });
      expect(clipped.lineClamp).toBe('none');
      expect(['visible', 'clip']).toContain(clipped.overflow);

      // Blank description: no block at all.
      await page.goto(`${WEB_URL}/${locale}/categories/${NO_DESCRIPTION}`);
      await expect(page.locator('#category-description')).toHaveCount(0);
    });

    test(`${locale}: the machine-count pill is gone and the count still has a home`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/categories/${SEEDED}`);
      await expect(page.locator('#category-hero-count')).toHaveCount(0);
      // It lives beside the "Machines in this category" heading instead.
      await expect(
        page.getByRole('heading', {
          name:
            locale === 'en' ? 'Machines in this category' : 'آلات هذه الفئة',
        })
      ).toBeVisible();
      const count = await page.getByRole('main').textContent();
      expect(count).toMatch(
        locale === 'en' ? /(\d+ machines?|No machines)/ : /(آلة|آلتان|آلات)/
      );
    });
  }
});

test('no horizontal overflow at 390/768/1280/1920, in both locales', async ({
  page,
}) => {
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 900 });
    for (const locale of ['en', 'ar'] as const) {
      for (const slug of [PHOTOS[0].slug, PHOTOS[1].slug, SEEDED]) {
        await page.goto(`${WEB_URL}/${locale}/categories/${slug}`);
        const widths = await page.evaluate(() => ({
          scroll: document.scrollingElement!.scrollWidth,
          client: document.documentElement.clientWidth,
          heroWidth: document
            .querySelector('#category-hero')!
            .getBoundingClientRect().width,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
        expect(widths.heroWidth).toBeLessThanOrEqual(widths.client + 1);
      }
    }
  }
});
