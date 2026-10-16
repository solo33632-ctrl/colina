import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The machine gallery must show every photo WHOLE.
//
// It used to hand the hero to `ImageWithFallback` with no `fit`, so the
// component's default `object-fit: cover` cropped every production-line photo
// to 16:9 — the top of a tank disappearing off the top of its own frame — and
// the thumbnails were cropped the same way. The frame's ratio also lived on the
// <img> rather than on a wrapper, so the same two-declarations conflict the
// cards were fixed for was live here too. These tests lock the corrections.
//
// Fixtures go straight to the database (db-fixture.ts) rather than through the
// admin UI: a public-page test should not need an admin login, an admin server
// and a set of translated form labels. Every fixture is tagged and removed
// again in `afterAll`.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

// Three photos that disagree with the frame in three different directions. A
// `cover` implementation loses a different part of each one, so all three have
// to be checked — one shape would pass by luck.
const PHOTOS = [
  { label: 'tall', w: 400, h: 900 },
  { label: 'wide', w: 1600, h: 500 },
  { label: 'square', w: 600, h: 600 },
] as const;

const CATEGORY = `${TAG}-galcat-${STAMP}`;
const MULTI = `${TAG}-gallery-${STAMP}`;
const SINGLE = `${TAG}-single-${STAMP}`;
const MULTI_NAME_EN = `Gallery Fixture ${STAMP}`;
const MULTI_NAME_AR = `آلة المعرض ${STAMP}`;

const gallery = (page: Page) =>
  page.locator('section[aria-labelledby="gallery-heading"]');

/**
 * The hero photo.
 *
 * Scoped to the aspect-ratio frame, which is what makes it unambiguous: the
 * thumbnails carry an empty `alt`, but the lightbox — which also lives inside
 * this section — renders a second full-size image with the machine's own `alt`,
 * so `img[alt]:not([alt=""])` alone matches two elements once the photo loads.
 */
const mainPhoto = (page: Page) =>
  gallery(page).locator('[class*="aspect-"] img[alt]:not([alt=""])');

/** Every thumbnail in the row below the frame. */
const thumbnails = (page: Page) => gallery(page).locator('img[alt=""]');

/**
 * The thumbnail buttons, scoped to the row.
 *
 * Not `button[aria-label]`: once the hero has loaded its frame becomes the
 * "view full-size image" button, which carries an aria-label too and sits
 * BEFORE the row in the DOM — so indices silently shifted mid-test and a click
 * meant for the first thumbnail opened the lightbox instead.
 */
const thumbButtons = (page: Page) => gallery(page).locator('ul button');

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Gallery Category ${STAMP}`,
    nameAr: `فئة المعرض ${STAMP}`,
    descriptionEn:
      'A category created only so these gallery specs have a machine.',
  });
  createMachine({
    slug: MULTI,
    nameEn: MULTI_NAME_EN,
    nameAr: MULTI_NAME_AR,
    shortDescriptionEn: 'A fixture machine with three photos of three shapes.',
    shortDescriptionAr: 'آلة تجريبية بثلاث صور مختلفة الأبعاد.',
    categorySlug: CATEGORY,
    images: PHOTOS.map((photo, position) => ({
      url: photoOf(photo.w, photo.h),
      position,
    })),
  });
  createMachine({
    slug: SINGLE,
    nameEn: `Single Photo ${STAMP}`,
    nameAr: `صورة واحدة ${STAMP}`,
    shortDescriptionEn: 'A fixture machine with exactly one photo.',
    shortDescriptionAr: 'آلة تجريبية بصورة واحدة.',
    categorySlug: CATEGORY,
    imageUrl: photoOf(600, 600),
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

/**
 * Asserts the hero photo is painted complete inside its frame.
 *
 * Four claims, because any one alone is satisfiable by a broken layout:
 *  1. `object-fit` computes to `contain`;
 *  2. the <img> box covers the frame (the padding is carved out of the image's
 *     own box, so the element itself is the frame);
 *  3. the PAINTED photo is inset from the frame's top and bottom by the frame's
 *     padding, and never wider or taller than it;
 *  4. the painted photo keeps the source's aspect ratio — a crop would distort
 *     it — and is letterboxed on at least one axis, which `cover` never is.
 */
async function expectPhotoComplete(photo: Locator) {
  // Switching photos makes React re-render the <img>; a measurement that lands
  // mid-swap can see a detached node, for which getComputedStyle returns empty
  // strings. Poll until the element is live and styled before measuring, so
  // this is a timing guard in the test rather than a flake in the component.
  await expect
    .poll(async () => photo.evaluate((el) => getComputedStyle(el).objectFit))
    .toBe('contain');

  const info = await photo.evaluate((el) => {
    const img = el as HTMLImageElement;
    const style = getComputedStyle(img);
    const frame = img.closest('[class*="aspect-"]')!.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    const padTop = Number.parseFloat(style.paddingTop) || 0;
    const padBottom = Number.parseFloat(style.paddingBottom) || 0;
    const padLeft = Number.parseFloat(style.paddingLeft) || 0;
    const padRight = Number.parseFloat(style.paddingRight) || 0;
    const contentWidth = box.width - padLeft - padRight;
    const contentHeight = box.height - padTop - padBottom;
    const scale = Math.min(
      contentWidth / img.naturalWidth,
      contentHeight / img.naturalHeight
    );
    const paintedWidth = img.naturalWidth * scale;
    const paintedHeight = img.naturalHeight * scale;
    const paintedLeft = box.left + padLeft + (contentWidth - paintedWidth) / 2;
    const paintedTop = box.top + padTop + (contentHeight - paintedHeight) / 2;
    return {
      objectFit: style.objectFit,
      naturalRatio: img.naturalWidth / img.naturalHeight,
      naturalLoaded: img.naturalWidth > 0,
      padTop,
      padBottom,
      padLeft,
      padRight,
      frame: {
        top: frame.top,
        bottom: frame.bottom,
        left: frame.left,
        right: frame.right,
        width: frame.width,
        height: frame.height,
      },
      painted: {
        left: paintedLeft,
        right: paintedLeft + paintedWidth,
        top: paintedTop,
        bottom: paintedTop + paintedHeight,
        width: paintedWidth,
        height: paintedHeight,
      },
    };
  });

  expect(info.objectFit).toBe('contain');
  expect(info.naturalLoaded).toBe(true);

  // The painted photo lies wholly inside the frame on every side.
  expect(info.painted.left).toBeGreaterThanOrEqual(info.frame.left - 1);
  expect(info.painted.right).toBeLessThanOrEqual(info.frame.right + 1);
  expect(info.painted.top).toBeGreaterThanOrEqual(info.frame.top - 1);
  expect(info.painted.bottom).toBeLessThanOrEqual(info.frame.bottom + 1);

  // And it keeps the frame's padding as a margin, top and bottom.
  expect(info.painted.top - info.frame.top).toBeGreaterThanOrEqual(
    info.padTop - 1
  );
  expect(info.frame.bottom - info.painted.bottom).toBeGreaterThanOrEqual(
    info.padBottom - 1
  );

  // Proportions preserved, and letterboxed rather than filled.
  expect(info.painted.width / info.painted.height).toBeCloseTo(
    info.naturalRatio,
    3
  );
  const letterboxed =
    info.painted.height <
      info.frame.height - info.padTop - info.padBottom - 1 ||
    info.painted.width < info.frame.width - info.padLeft - info.padRight - 1;
  expect(letterboxed).toBe(true);
}

for (const locale of ['en', 'ar'] as const) {
  for (const width of [1280, 390] as const) {
    test(`${locale} at ${width}px: every photo is complete and the frame never changes size`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MULTI}`);

      const photo = mainPhoto(page);
      await expect(photo).toHaveCount(1);

      const thumbs = thumbnails(page);
      await expect(thumbs).toHaveCount(PHOTOS.length);
      const thumbRow = thumbButtons(page);
      await expect(thumbRow).toHaveCount(PHOTOS.length);

      const frameHeights: number[] = [];

      for (let index = 0; index < PHOTOS.length; index += 1) {
        // Select the photo: the first is already showing, the rest by clicking.
        if (index > 0) {
          await thumbRow.nth(index).click();
        }

        // Wait for the swapped photo to be decoded before measuring it.
        await page.waitForFunction(
          () => {
            const img = document.querySelector(
              'section[aria-labelledby="gallery-heading"] [class*="aspect-"] img[alt]:not([alt=""])'
            ) as HTMLImageElement | null;
            return Boolean(img && img.complete && img.naturalWidth > 0);
          },
          undefined,
          { timeout: 15000 }
        );

        await expectPhotoComplete(photo);
        frameHeights.push(
          await photo.evaluate(
            (el) =>
              el.closest('[class*="aspect-"]')!.getBoundingClientRect().height
          )
        );

        // Whichever photo is on screen, the active thumbnail is the one for it.
        await expect(
          gallery(page).locator('button[aria-current="true"]')
        ).toHaveCount(1);
      }

      // The frame's height is a function of the fixed ratio and the column
      // width only, so switching a 400x900 portrait for a 1600x500 panorama
      // moves nothing on the page.
      expect(
        Math.max(...frameHeights) - Math.min(...frameHeights)
      ).toBeLessThanOrEqual(1);
    });

    test(`${locale} at ${width}px: thumbnails sit in one row below the frame`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MULTI}`);

      const thumbs = thumbnails(page);
      await expect(thumbs).toHaveCount(PHOTOS.length);

      const frameBottom = await mainPhoto(page).evaluate(
        (el) => el.closest('[class*="aspect-"]')!.getBoundingClientRect().bottom
      );
      const tops = await thumbs.evaluateAll((els) =>
        els.map((el) => Math.round(el.getBoundingClientRect().top))
      );

      // One row: every thumbnail starts at the same height...
      expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
      // ...and the whole row is BELOW the frame, not beside it. The frame used
      // to be flanked by a narrow `lg:w-24` column, which is where the dead
      // space the owner reported came from.
      for (const top of tops) {
        expect(top).toBeGreaterThan(frameBottom - 1);
      }
    });

    test(`${locale} at ${width}px: clicking a thumbnail swaps the main photo`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MULTI}`);

      const photo = mainPhoto(page);
      const first = await photo.getAttribute('src');
      const buttons = thumbButtons(page);

      await buttons.nth(1).click();
      await expect(photo).not.toHaveAttribute('src', first!);
      const second = await photo.getAttribute('src');

      // And back again, which also proves the first thumbnail is reachable.
      await buttons.nth(0).click();
      await expect(photo).toHaveAttribute('src', first!);
      expect(second).not.toBe(first);
    });

    test(`${locale} at ${width}px: the lightbox shows the whole photo and closes on Escape`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MULTI}`);

      // The frame becomes a button once the photo has loaded.
      const opener = gallery(page).getByRole('button', {
        name:
          locale === 'en' ? 'View full-size image' : 'عرض الصورة بالحجم الكامل',
      });
      await expect(opener).toBeVisible();
      await opener.click();

      const dialog = page.locator('dialog[open]');
      await expect(dialog).toBeVisible();

      const full = dialog.locator('img');
      await expect(full).toHaveCount(1);
      const box = await full.evaluate((el) => {
        const img = el as HTMLImageElement;
        const rect = img.getBoundingClientRect();
        return {
          objectFit: getComputedStyle(img).objectFit,
          left: rect.left,
          top: rect.top,
          right: rect.right,
          bottom: rect.bottom,
          viewportWidth: document.documentElement.clientWidth,
          viewportHeight: document.documentElement.clientHeight,
          naturalRatio: img.naturalWidth / img.naturalHeight,
          paintedRatio: rect.width / rect.height,
        };
      });

      // Whole, never cropped, never stretched, and inside the viewport.
      expect(box.objectFit).toBe('contain');
      expect(box.left).toBeGreaterThanOrEqual(-1);
      expect(box.top).toBeGreaterThanOrEqual(-1);
      expect(box.right).toBeLessThanOrEqual(box.viewportWidth + 1);
      expect(box.bottom).toBeLessThanOrEqual(box.viewportHeight + 1);
      // A stretched photo would distort its proportions; a cropped one is
      // letterboxed by `contain` and so keeps them too.
      expect(box.paintedRatio).toBeCloseTo(box.naturalRatio, 2);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });

    test(`${locale} at ${width}px: a single-photo machine has no thumbnail row`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${SINGLE}`);

      await expect(gallery(page)).toHaveCount(1);
      await expect(mainPhoto(page)).toHaveCount(1);
      // No row at all: a one-item "gallery" is just a smaller copy of the photo.
      await expect(thumbnails(page)).toHaveCount(0);
      await expect(gallery(page).locator('ul')).toHaveCount(0);
    });

    test(`${locale} at ${width}px: the page never scrolls sideways`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MULTI}`);

      const widths = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    });
  }
}
