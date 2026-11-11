import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Stage 28b: content photos are marked with `data-protected-image`; one
// delegated listener pair blocks only the native drag and context menu on
// those elements. Everything else — text selection, copy, context menus on
// text and links, the lightbox, the magnifier — must be untouched.
//
// Fixtures go straight to the database, like the other public specs, and are
// removed by `cleanupFixtures` in `afterAll`.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-protcat-${STAMP}`;
const MACHINE = `${TAG}-protmachine-${STAMP}`;
const SHORT_EN = `Photo protection fixture ${STAMP}`;
const SHORT_AR = `آلة صورمحمية ${STAMP}`;
const SUMMARY_EN = `Short description ${STAMP}.`;
const SUMMARY_AR = 'وصف قصير.';
const DESCRIPTION_EN = `A category photo and a machine card for the protection spec ${STAMP}.`;

const COPY = {
  en: { openImage: 'View full-size image', closeImage: 'Close image' },
  ar: { openImage: 'عرض الصورة بالحجم الكامل', closeImage: 'إغلاق الصورة' },
} as const;

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Protected Category ${STAMP}`,
    nameAr: `فئة محمية ${STAMP}`,
    descriptionEn: DESCRIPTION_EN,
    descriptionAr: 'وصف فئة محمية.',
    image: photoOf(1200, 800),
  });
  createMachine({
    slug: MACHINE,
    nameEn: SHORT_EN,
    nameAr: SHORT_AR,
    shortDescriptionEn: SUMMARY_EN,
    shortDescriptionAr: SUMMARY_AR,
    categorySlug: CATEGORY,
    images: [
      { url: photoOf(400, 900), position: 0 },
      { url: photoOf(1600, 500), position: 1 },
      { url: photoOf(600, 600), position: 2 },
    ],
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

const gallery = (page: Page) =>
  page.locator('section[aria-labelledby="gallery-heading"]');

/** The gallery hero: the only protected image with a non-empty alt. */
const heroPhoto = (page: Page) =>
  gallery(page).locator('img[data-protected-image][alt]:not([alt=""])').first();

/** Every protected thumbnail. */
const thumbnailPhotos = (page: Page) =>
  gallery(page).locator('ul img[data-protected-image]');

const lens = (page: Page) => page.getByTestId('zoom-lens');

type DispatchResult = { dispatched: boolean; defaultPrevented: boolean };

async function dispatchOn(
  target: Locator,
  type: 'contextmenu' | 'dragstart'
): Promise<DispatchResult> {
  return target.evaluate((element, eventType) => {
    const event = new Event(eventType, { bubbles: true, cancelable: true });
    const dispatched = element.dispatchEvent(event);
    return { dispatched, defaultPrevented: event.defaultPrevented };
  }, type);
}

async function expectProtected(
  target: Locator,
  { draggable = true }: { draggable?: boolean } = {}
) {
  expect(await target.getAttribute('data-protected-image')).not.toBeNull();
  if (draggable) {
    expect(await target.getAttribute('draggable')).toBe('false');
  }
  // Poll: the dev server's first compile and React hydration can replace the
  // node just after the locator resolves it, and `getComputedStyle` on a
  // detached node returns empty strings.
  await expect
    .poll(() =>
      target.evaluate((element) =>
        element.isConnected ? getComputedStyle(element).userSelect : null
      )
    )
    .toBe('none');

  for (const type of ['contextmenu', 'dragstart'] as const) {
    expect(await dispatchOn(target, type), type).toEqual({
      dispatched: false,
      defaultPrevented: true,
    });
  }
}

async function expectNotProtected(target: Locator) {
  for (const type of ['contextmenu', 'dragstart'] as const) {
    expect(await dispatchOn(target, type), type).toEqual({
      dispatched: true,
      defaultPrevented: false,
    });
  }
}

for (const locale of ['en', 'ar'] as const) {
  test.describe(`${locale}: photo deterrents`, () => {
    for (const width of [1280, 390] as const) {
      test(`${width}px: photos are protected and text/links are not`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });

        // --- Machine page -------------------------------------------------
        await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

        const hero = heroPhoto(page);
        await expect(hero).toBeVisible();
        await expectProtected(hero);

        const thumbnails = thumbnailPhotos(page);
        await expect(thumbnails).toHaveCount(3);
        for (let index = 0; index < 3; index++) {
          await expectProtected(thumbnails.nth(index));
        }

        // Page text keeps its normal context menu.
        await expectNotProtected(
          page
            .locator('main p', {
              hasText: locale === 'en' ? SUMMARY_EN : SUMMARY_AR,
            })
            .first()
        );

        // So does a link (the category link in the summary column).
        await expectNotProtected(
          page.locator('main a[href*="/categories/"]').first()
        );

        // The lightbox still opens from the gallery, and its full-size image
        // is protected too.
        await gallery(page)
          .getByRole('button', { name: COPY[locale].openImage })
          .click();
        const dialog = page.locator('dialog[open]');
        await expect(dialog).toBeVisible();
        await expectProtected(dialog.locator('img'));
        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // --- Category page ------------------------------------------------
        await page.goto(`${WEB_URL}/${locale}/categories/${CATEGORY}`);

        const categoryHero = page.locator('#category-hero img[data-protected-image]');
        await expect(categoryHero).toBeVisible();
        await expectProtected(categoryHero);

        // The scrim is the topmost element over the hero, so it carries the
        // marker as well; a right-click over the photo lands on it.
        await expectProtected(
          page.locator('#category-hero div[data-protected-image]').first(),
          { draggable: false }
        );

        // The machine card photo is protected...
        const cardPhoto = page
          .locator('main ul img[data-protected-image]')
          .first();
        await expectProtected(cardPhoto);

        // ...but the card's link and the description text are not.
        await expectNotProtected(
          page.locator('main ul a[href*="/machines/"]').first()
        );
        await expectNotProtected(page.locator('#category-description'));
      });
    }

    test(`${locale}: the magnifier still works on a protected hero`, async ({
      page,
    }) => {
      test.skip(
        !(await page.evaluate(
          () => matchMedia('(hover: hover) and (pointer: fine)').matches
        )),
        'the lens only exists on a fine-pointer context'
      );

      await page.setViewportSize({ width: 1280, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

      await expect(lens(page)).toHaveCount(1);
      const hero = heroPhoto(page);
      await expect(hero).toBeVisible();
      // The hero button only exists once the image has loaded and its natural
      // size reached React, which is also what enables the lens.
      await expect(
        gallery(page).getByRole('button', { name: COPY[locale].openImage })
      ).toBeVisible();
      const box = await hero.boundingBox();
      expect(box).not.toBeNull();

      await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
      await expect(lens(page)).toBeVisible();

      await page.mouse.move(0, 0);
      await expect(lens(page)).toBeHidden();
    });
  });
}
