import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Stage 28c: render-time Cloudinary delivery.
//
// Every fixture photo here is served by Playwright itself — the test routes
// the whole `res.cloudinary.com` host to a tiny inline SVG — so the spec
// proves the RENDERED URLs without touching the real CDN. A separate machine
// fixture uses a data URI, which is not a Cloudinary host, and must render
// byte-for-byte as before.
//
// Fixtures go straight to the database and are removed in `afterAll`.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-deliverycat-${STAMP}`;
const CLOUDINARY_MACHINE = `${TAG}-deliverym-${STAMP}`;
const PLAIN_MACHINE = `${TAG}-plainm-${STAMP}`;

const CLOUDINARY_URL = `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/delivery-${STAMP}.jpg`;
const CLOUDINARY_BASE =
  'https://res.cloudinary.com/demo-cloud/image/upload';
const CLOUDINARY_PATH = `v1712345678/colina/delivery-${STAMP}.jpg`;

const WIDTHS = [400, 800, 1200, 1600, 2000] as const;

const NAME_EN = `Delivery Fixture ${STAMP}`;
const NAME_AR = `آلة التسليم ${STAMP}`;
const PLAIN_NAME_EN = `Plain Fixture ${STAMP}`;
const PLAIN_NAME_AR = `آلة عادية ${STAMP}`;

const PLAIN_PHOTO = photoOf(800, 200);

const COPY = {
  en: { openImage: 'View full-size image' },
  ar: { openImage: 'عرض الصورة بالحجم الكامل' },
} as const;

// A tiny, valid image with real intrinsic dimensions. Serving it for every
// Cloudinary request keeps `naturalWidth` meaningful for the magnifier while
// costing no network hop.
const STUB_IMAGE = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">',
  '<rect width="1200" height="800" fill="#EB693F"/>',
  '<circle cx="400" cy="400" r="200" fill="#FFF0E2"/>',
  '</svg>',
].join('');

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Delivery Category ${STAMP}`,
    nameAr: `فئة التسليم ${STAMP}`,
    descriptionEn: 'A category created only for the image-delivery specs.',
  });
  createMachine({
    slug: CLOUDINARY_MACHINE,
    nameEn: NAME_EN,
    nameAr: NAME_AR,
    shortDescriptionEn: 'A fixture machine whose photo lives on Cloudinary.',
    shortDescriptionAr: 'آلة تجريبية صورتها على كلاوديناري.',
    categorySlug: CATEGORY,
    images: [{ url: CLOUDINARY_URL, position: 0 }],
  });
  createMachine({
    slug: PLAIN_MACHINE,
    nameEn: PLAIN_NAME_EN,
    nameAr: PLAIN_NAME_AR,
    shortDescriptionEn: 'A fixture machine whose photo is not on Cloudinary.',
    shortDescriptionAr: 'آلة تجريبية صورتها ليست على كلاوديناري.',
    categorySlug: CATEGORY,
    imageUrl: PLAIN_PHOTO,
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

const gallery = (page: Page) =>
  page.locator('section[aria-labelledby="gallery-heading"]');

/** The hero photo: the only gallery image with a non-empty alt. */
const hero = (page: Page) =>
  gallery(page)
    .locator('[class*="aspect-"] img[alt]:not([alt=""])')
    .first();

/** Stubs every Cloudinary request and records the URLs the browser asked for. */
async function stubCloudinary(page: Page): Promise<string[]> {
  const requested: string[] = [];
  await page.route('https://res.cloudinary.com/**', async (route) => {
    requested.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: STUB_IMAGE,
    });
  });
  return requested;
}

async function waitForPhoto(image: Locator) {
  await expect
    .poll(() =>
      image.evaluate(
        (element) =>
          (element as HTMLImageElement).complete &&
          (element as HTMLImageElement).naturalWidth > 0
      )
    )
    .toBe(true);
}

for (const locale of ['en', 'ar'] as const) {
  test.describe(`${locale}: Cloudinary delivery`, () => {
    // The magnifier only exists on a fine pointer. Every EN/AR × width case
    // should exercise it, so the context is stated rather than inherited.
    test.use({ hasTouch: false });

    for (const width of [1280, 390] as const) {
      test(`${width}px: Cloudinary photos get srcset and other hosts pass through`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const requested = await stubCloudinary(page);

        await page.goto(`${WEB_URL}/${locale}/machines/${CLOUDINARY_MACHINE}`);
        const delivered = hero(page);
        await expect(delivered).toBeVisible();
        await waitForPhoto(delivered);

        // The default src is the w_1200 derivative, not the stored URL.
        await expect(delivered).toHaveAttribute(
          'src',
          `${CLOUDINARY_BASE}/f_auto,q_auto,c_limit,w_1200/${CLOUDINARY_PATH}`
        );

        // The srcset lists every width, each with its own transformation and
        // w descriptor. Transformation commas are inside a URL, not entry
        // separators, so splitting on comma-space gives exactly the entries.
        const srcset = await delivered.getAttribute('srcset');
        expect(srcset).not.toBeNull();
        const entries = srcset!.split(', ');
        expect(entries).toHaveLength(WIDTHS.length);
        WIDTHS.forEach((widthEntry, index) => {
          expect(entries[index]).toBe(
            `${CLOUDINARY_BASE}/f_auto,q_auto,c_limit,w_${widthEntry}/${CLOUDINARY_PATH} ${widthEntry}w`
          );
        });

        // The browser selected (and actually fetched) a transformed candidate,
        // never the raw stored URL.
        const currentSrc = await delivered.evaluate(
          (element) => (element as HTMLImageElement).currentSrc
        );
        expect(currentSrc).not.toBe(CLOUDINARY_URL);
        expect(currentSrc.startsWith(`${CLOUDINARY_BASE}/f_auto,q_auto`)).toBe(
          true
        );
        expect(requested.some((url) => url.includes('f_auto,q_auto'))).toBe(
          true
        );
        expect(requested).not.toContain(CLOUDINARY_URL);

        // A non-Cloudinary fixture keeps its exact src and has no srcset.
        await page.goto(`${WEB_URL}/${locale}/machines/${PLAIN_MACHINE}`);
        const plain = hero(page);
        await expect(plain).toBeVisible();
        await waitForPhoto(plain);
        await expect(plain).toHaveAttribute('src', PLAIN_PHOTO);
        expect(await plain.getAttribute('srcset')).toBeNull();
      });

      test(`${width}px: the lightbox and magnifier use the w_2000 derivative`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        const requested = await stubCloudinary(page);

        await page.goto(`${WEB_URL}/${locale}/machines/${CLOUDINARY_MACHINE}`);
        const delivered = hero(page);
        await waitForPhoto(delivered);

        // The frame becomes the opener only after the photo has loaded.
        const opener = gallery(page).getByRole('button', {
          name: COPY[locale].openImage,
        });
        await expect(opener).toBeVisible();

        // --- Lightbox -----------------------------------------------------
        // The hero's srcset picks a width for its own rendered size (800w at
        // this viewport); w_2000 is the lightbox's request.
        await opener.click();

        const dialog = page.locator('dialog[open]');
        await expect(dialog).toBeVisible();
        const full = dialog.locator('img');
        await expect(full).toHaveCount(1);
        await expect(full).toHaveAttribute(
          'src',
          `${CLOUDINARY_BASE}/f_auto,q_auto,c_limit,w_2000/${CLOUDINARY_PATH}`
        );
        await waitForPhoto(full);
        expect(
          requested.some(
            (url) =>
              url ===
              `${CLOUDINARY_BASE}/f_auto,q_auto,c_limit,w_2000/${CLOUDINARY_PATH}`
          )
        ).toBe(true);

        await page.keyboard.press('Escape');
        await expect(dialog).toHaveCount(0);

        // --- Magnifier ----------------------------------------------------
        const lens = page.getByTestId('zoom-lens');
        await expect(lens).toHaveCount(1);
        const box = await delivered.boundingBox();
        expect(box).not.toBeNull();
        await page.mouse.move(
          box!.x + box!.width / 2,
          box!.y + box!.height / 2
        );
        await expect(lens).toBeVisible();

        await expect
          .poll(() =>
            lens.evaluate((element) =>
              getComputedStyle(element).backgroundImage
            )
          )
          .toContain('f_auto,q_auto,c_limit,w_2000');
        await page.mouse.move(0, 0);
      });
    }
  });
}
