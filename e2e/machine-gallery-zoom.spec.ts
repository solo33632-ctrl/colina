import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The gallery's hover magnifier.
//
// It magnifies what the visitor actually SEES, and since the photo is
// `object-contain` inside a fixed 4:3 frame, what they see is a letterboxed
// picture rather than a frame-filling one. Getting that wrong shows a pane of
// grey where the letterbox is — which is exactly what this spec pins down: the
// lens has to sit wholly inside the PAINTED photo, and it has to disappear
// entirely when the pointer is over a letterbox bar where there is nothing to
// magnify.
//
// The three proportions are the same three machine-gallery.spec.ts uses, on
// purpose: a 400x900 portrait, a 1600x500 panorama and a 600x600 square
// letterbox on three different axes, so no implementation can pass by luck.
// This file keeps its own tagged fixture rather than importing that spec's,
// which is local to it.
//
// Fixtures go straight to the database and are removed in `afterAll`. Nothing
// here submits anything.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-zoomcat-${STAMP}`;
const MACHINE = `${TAG}-zoomm-${STAMP}`;

const PHOTOS = [
  { label: 'tall', w: 400, h: 900 },
  { label: 'wide', w: 1600, h: 500 },
  { label: 'square', w: 600, h: 600 },
] as const;

/** The gallery frame, the element the pointer is expected to travel over. */
const frame = (page: Page) =>
  page
    .locator('section[aria-labelledby="gallery-heading"] [class*="aspect-"]')
    .first();

/** The hero photo itself. */
const hero = (page: Page) =>
  page.locator(
    'section[aria-labelledby="gallery-heading"] [class*="aspect-"] img[alt]:not([alt=""])'
  );

/** The magnifier pane. Its only handle is the `data-testid` added for these tests. */
const lens = (page: Page) => page.getByTestId('zoom-lens');

/** The thumbnail buttons, scoped to the row below the frame. */
const thumbs = (page: Page) =>
  page.locator('section[aria-labelledby="gallery-heading"] ul button');

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Zoom Category ${STAMP}`,
    nameAr: `فئة التكبير ${STAMP}`,
    descriptionEn: 'A category created only for the magnifier specs.',
  });
  createMachine({
    slug: MACHINE,
    nameEn: `Zoom Fixture ${STAMP}`,
    nameAr: `آلة التكبير ${STAMP}`,
    shortDescriptionEn: 'A fixture machine with three photos of three shapes.',
    shortDescriptionAr: 'آلة تجريبية بثلاث صور مختلفة الأبعاد.',
    categorySlug: CATEGORY,
    images: PHOTOS.map((photo, position) => ({
      url: photoOf(photo.w, photo.h),
      position,
    })),
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

/**
 * Waits for the hero photo to be decoded, then reads where it is actually
 * painted.
 *
 * `object-fit: contain` letterboxes the photo inside the image's CONTENT box
 * (the frame less its padding), so the painted rectangle has to be recomputed
 * from the natural size the way `expectPhotoComplete` does in
 * machine-gallery.spec.ts. Anything that assumed the photo filled the frame —
 * which was true back when it was `cover`, and is not any more — puts the lens
 * in the grey.
 */
async function paintedPhoto(photo: Locator) {
  await expect
    .poll(async () =>
      photo.evaluate((el) => el.complete && el.naturalWidth > 0)
    )
    .toBe(true);
  return photo.evaluate((el) => {
    const img = el as HTMLImageElement;
    const style = getComputedStyle(img);
    const pad = {
      top: Number.parseFloat(style.paddingTop) || 0,
      left: Number.parseFloat(style.paddingLeft) || 0,
    };
    const box = img.getBoundingClientRect();
    const contentWidth = box.width - pad.left * 2;
    const contentHeight = box.height - pad.top * 2;
    const scale = Math.min(
      contentWidth / img.naturalWidth,
      contentHeight / img.naturalHeight
    );
    const width = img.naturalWidth * scale;
    const height = img.naturalHeight * scale;
    const left = box.left + pad.left + (contentWidth - width) / 2;
    const top = box.top + pad.top + (contentHeight - height) / 2;
    return {
      left,
      top,
      right: left + width,
      bottom: top + height,
      src: img.currentSrc || img.src,
    };
  });
}

/** The lens's box in viewport coordinates. */
async function lensBox(page: Page) {
  return lens(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
    };
  });
}

for (const locale of ['en', 'ar'] as const) {
  test.describe(`${locale} with a fine pointer: the magnifier`, () => {
    // Playwright's default Chromium is a hover-capable, fine-pointer context,
    // which is what switches the component onto the lens path at all. Stated
    // rather than assumed, so the suite does not silently start testing the
    // touch path if the default context ever changes.
    test.use({ hasTouch: false, viewport: { width: 1280, height: 900 } });

    test.beforeEach(async ({ page }) => {
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);
      // The lens only exists on the hover path, so its presence is itself the
      // proof that this context reached it.
      await expect(lens(page)).toHaveCount(1);
      await expect
        .poll(() =>
          page.evaluate(
            () => matchMedia('(hover: hover) and (pointer: fine)').matches
          )
        )
        .toBe(true);
    });

    for (const photo of PHOTOS) {
      test(`shows the ${photo.label} photo magnified, wholly inside the painted photo`, async ({
        page,
      }) => {
        const index = PHOTOS.indexOf(photo);
        if (index > 0) {
          await thumbs(page).nth(index).click();
        }

        const painted = await paintedPhoto(hero(page));
        expect(painted.src).not.toBe('');

        // Hover the CENTRE of the photo. For all three proportions the centre is
        // inside the painted rectangle, whatever the letterbox axis is.
        await page.mouse.move(
          (painted.left + painted.right) / 2,
          (painted.top + painted.bottom) / 2
        );
        await expect(lens(page)).toBeVisible();

        const box = await lensBox(page);

        // The lens lies wholly inside the PAINTED photo on every side. This is
        // the assertion that separates a magnifier from a magnifying glass held
        // over a grey background: a lens allowed to spill into the letterbox is
        // showing the frame's padding as though it were part of the machine.
        expect(box.left).toBeGreaterThanOrEqual(painted.left - 1);
        expect(box.right).toBeLessThanOrEqual(painted.right + 1);
        expect(box.top).toBeGreaterThanOrEqual(painted.top - 1);
        expect(box.bottom).toBeLessThanOrEqual(painted.bottom + 1);

        // And it magnifies THIS photo, not a thumbnail of some other machine.
        // The pane is a `background-image` written straight to the element, so
        // the only honest comparison is the resolved URL against the hero's.
        const background = await lens(page).evaluate(
          (el) => getComputedStyle(el).backgroundImage
        );
        const url = /^url\(["']?(.*?)["']?\)$/.exec(background)?.[1] ?? null;
        expect(url).toBe(painted.src);

        // A lens, not a second hero.
        expect(box.width).toBeLessThanOrEqual(260);
      });

      test(`hides the ${photo.label} lens over the letterbox and off the frame`, async ({
        page,
      }) => {
        const index = PHOTOS.indexOf(photo);
        if (index > 0) {
          await thumbs(page).nth(index).click();
        }
        const painted = await paintedPhoto(hero(page));

        // Somewhere over the photo, so the lens is genuinely up first.
        await page.mouse.move(
          (painted.left + painted.right) / 2,
          (painted.top + painted.bottom) / 2
        );
        await expect(lens(page)).toBeVisible();

        // Then the top-left inside corner of the FRAME. Every one of the three
        // proportions letterboxes there — the portrait on the sides, the
        // panorama above and below, the square on both — so one point covers
        // all of them, and it is far enough inside the frame that it is not
        // merely outside the element.
        const frameBox = await frame(page).evaluate((el) => {
          const rect = el.getBoundingClientRect();
          return { x: rect.x, y: rect.y };
        });
        const letterboxX = frameBox.x + 4;
        const letterboxY = frameBox.y + 4;
        const onPhoto =
          letterboxX >= painted.left &&
          letterboxX <= painted.right &&
          letterboxY >= painted.top &&
          letterboxY <= painted.bottom;
        expect(onPhoto).toBe(false);

        await page.mouse.move(letterboxX, letterboxY);
        // There is nothing to magnify in a grey bar, so the pane goes away
        // rather than showing a disc of padding.
        await expect(lens(page)).toBeHidden();

        // And leaving the frame entirely hides it too — otherwise the lens
        // would follow the visitor off the photo and sit over the rest of the
        // page.
        await page.mouse.move(frameBox.x - 20, frameBox.y - 20);
        await expect(lens(page)).toBeHidden();
      });
    }
  });

  test.describe(`${locale} with a touch pointer: no magnifier`, () => {
    test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

    test('never shows a lens, and a tap opens the lightbox instead', async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

      // Touch emulation really does flip the media query the component branches
      // on; if it stopped doing so, the rest of this test would be asserting
      // nothing at all.
      await expect
        .poll(() =>
          page.evaluate(
            () => matchMedia('(hover: hover) and (pointer: fine)').matches
          )
        )
        .toBe(false);

      // The lens is not rendered on this path at all — not rendered and then
      // hidden, which is a different claim.
      await expect(lens(page)).toHaveCount(0);

      const painted = await paintedPhoto(hero(page));

      // Drag a pointer across the photo anyway. The handler ignores every move
      // when the pointer cannot hover, so no lens may appear.
      await page.mouse.move(
        (painted.left + painted.right) / 2,
        (painted.top + painted.bottom) / 2
      );
      await expect(lens(page)).toHaveCount(0);

      // A tap is what a finger does, and here it opens the lightbox instead.
      await frame(page).tap();
      const dialog = page.locator('dialog[open]');
      await expect(dialog).toBeVisible();
      await expect(dialog.locator('img')).toHaveCount(1);
      // Still no lens behind the overlay.
      await expect(lens(page)).toHaveCount(0);

      await page.keyboard.press('Escape');
      await expect(dialog).toHaveCount(0);
    });
  });
}
