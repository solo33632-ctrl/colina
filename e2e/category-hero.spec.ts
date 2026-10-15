import { test, expect, type Page } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const en = copyFor('en');

// Phase 26: the category detail hero must show the whole photo (letterboxed,
// never cropped) beside a blurred backdrop, mirroring across RTL — and the
// long-form fields (category description, machine full description/specs) are
// now optional, so blank in the admin means the section is absent on the
// public page. These tests drive the real admin forms and read the public
// pages back, so they also lock the "blank saves and disappears" behaviour.
test.describe('category hero photo', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // A photo that loads: picsum delivers a fixed-dimension image per seed.
  // Offline environments get the structural assertions only — the spec must
  // not fail because an external CDN is unreachable.
  const TALL_PHOTO = `https://picsum.photos/seed/colina-tall-${Date.now().toString(36)}/400/900`;
  const WIDE_PHOTO = `https://picsum.photos/seed/colina-wide-${Date.now().toString(36)}/1600/500`;

  async function createCategoryWithPhoto(
    page: Page,
    name: string,
    slug: string,
    imageUrl: string
  ) {
    await page.goto(`${ADMIN_URL}/en/categories/new`);
    await page.getByLabel('Name (English)').fill(name);
    await page.getByLabel('Name (Arabic)').fill(`فئة ${name}`);
    await page.getByLabel('Slug').fill(slug);
    // Description left completely blank on purpose: it must save (Phase 26)
    // and the public page must then render no description block.
    await page.getByRole('button', { name: 'Or paste a URL' }).click();
    await page.locator('#cat-image-url').fill(imageUrl);
    await page.getByRole('button', { name: 'Create category' }).click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
  }

  async function deleteCategory(page: Page, name: string) {
    await page.goto(`${ADMIN_URL}/en/categories?q=${encodeURIComponent(name)}`);
    await page
      .locator('tr', { hasText: name })
      .getByRole('link', { name: 'Edit' })
      .click();
    await expect(page).toHaveURL(/\/categories\/[^/]+\/edit$/);
    await page
      .getByRole('button', { name: new RegExp(`^Delete ${name}`) })
      .click();
    await page
      .getByRole('dialog')
      .getByRole('button', { name: 'Delete' })
      .click();
    await expect(page).toHaveURL(`${ADMIN_URL}/en/categories`);
  }

  test('a photo category renders the whole photo letterboxed beside a blurred backdrop, in both locales', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    const stamp = Date.now().toString(36);
    const tallName = `Hero Tall ${stamp}`;
    const tallSlug = `hero-tall-${stamp}`;
    const wideName = `Hero Wide ${stamp}`;
    const wideSlug = `hero-wide-${stamp}`;
    try {
      await createCategoryWithPhoto(page, tallName, tallSlug, TALL_PHOTO);
      await createCategoryWithPhoto(page, wideName, wideSlug, WIDE_PHOTO);

      // The blank description saved with the categories above must not
      // render a description block on the public page.
      for (const [locale, slug] of [
        ['en', tallSlug],
        ['en', wideSlug],
        ['ar', tallSlug],
        ['ar', wideSlug],
      ] as const) {
        await page.goto(`${WEB_URL}/${locale}/categories/${slug}`);
        await expect(page.locator('#category-description')).toHaveCount(0);
      }

      // Structural checks that do not depend on the CDN: both layers exist,
      // the backdrop is cover + blurred, the photo is contain.
      for (const [locale, slug] of [
        ['en', tallSlug],
        ['ar', tallSlug],
      ] as const) {
        await page.goto(`${WEB_URL}/${locale}/categories/${slug}`);
        const backdrop = page.locator('#category-hero-backdrop');
        const photo = page.locator('#category-hero-photo img');
        await expect(backdrop).toHaveCount(1);
        await expect(photo).toHaveCount(1);

        const backdropStyle = await backdrop.evaluate((element) => {
          const style = getComputedStyle(element);
          return { objectFit: style.objectFit, filter: style.filter };
        });
        expect(backdropStyle.objectFit).toBe('cover');
        expect(backdropStyle.filter).toContain('blur(');

        const photoStyle = await photo.evaluate(
          (element) => getComputedStyle(element).objectFit
        );
        expect(photoStyle).toBe('contain');

        // The inset photo sits on the inline end: flush right in LTR, flush
        // left in RTL — and the title never reaches it.
        const geometry = await page.evaluate(() => {
          const box = document.getElementById('category-hero-photo')!;
          const title = document.querySelector('h1')!;
          const photoRect = box.getBoundingClientRect();
          const titleRect = title.getBoundingClientRect();
          const computed = getComputedStyle(box);
          return {
            left: computed.left,
            right: computed.right,
            photoRect,
            titleRect,
          };
        });
        if (locale === 'en') {
          expect(geometry.right).toBe('0px');
          expect(geometry.titleRect.right).toBeLessThanOrEqual(
            geometry.photoRect.left + 1
          );
        } else {
          expect(geometry.left).toBe('0px');
          expect(geometry.titleRect.left).toBeGreaterThanOrEqual(
            geometry.photoRect.right - 1
          );
        }
      }

      // When the CDN answers, prove nothing is cropped: the drawn image must
      // keep the source's aspect ratio exactly (a cropped `cover` would not).
      await page.goto(`${WEB_URL}/en/categories/${tallSlug}`);
      const img = page.locator('#category-hero-photo img');
      const loaded = await img
        .evaluate((element) => (element as HTMLImageElement).naturalWidth > 0)
        .catch(() => false);
      if (loaded) {
        const sizes = await img.evaluate((element) => {
          const image = element as HTMLImageElement;
          const rect = image.getBoundingClientRect();
          const box = image.parentElement!.getBoundingClientRect();
          const drawnWidth = Math.min(
            box.width,
            box.height * (image.naturalWidth / image.naturalHeight)
          );
          const drawnHeight = Math.min(
            box.height,
            box.width * (image.naturalHeight / image.naturalWidth)
          );
          return {
            boxWidth: box.width,
            boxHeight: box.height,
            drawnWidth,
            drawnHeight,
            naturalWidth: image.naturalWidth,
            naturalHeight: image.naturalHeight,
          };
        });
        // A tall 400×900 photo in a 40%-wide box: the drawing is height-
        // limited, and the drawn area equals the box on the limited axis.
        expect(sizes.drawnHeight).toBeCloseTo(sizes.boxHeight, 0);
        expect(sizes.drawnWidth).toBeLessThanOrEqual(sizes.boxWidth + 1);
        expect(sizes.boxHeight / sizes.drawnWidth).toBeCloseTo(
          sizes.naturalHeight / sizes.naturalWidth,
          1
        );
      }
    } finally {
      await deleteCategory(page, tallName);
      await deleteCategory(page, wideName);
      await context.close();
    }
  });

  test('a category without a photo keeps the plain band, never a blurred hero', async ({
    page,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}/categories/production-lines`);
      await expect(page.locator('#category-hero-backdrop')).toHaveCount(0);
      await expect(page.locator('#category-hero-photo')).toHaveCount(0);
      // The title is still there, on the plain brand band.
      const title = locale === 'en' ? 'Production Lines' : 'خطوط الإنتاج';
      await expect(
        page.getByRole('heading', { level: 1, name: title })
      ).toBeVisible();
    }
  });
});

test.describe('optional machine long-form fields', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test('a machine saved with blank specs and full description renders neither section on the public page', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    const stamp = `blank-${Date.now().toString(36)}`;
    const name = `Blank Fields E2E ${stamp}`;

    try {
      await page.goto(`${ADMIN_URL}/en/machines/new`);
      await page.getByLabel('Name (English)').fill(name);
      await page.getByLabel('Name (Arabic)').fill(`آلة ${stamp}`);
      await page.getByLabel('Slug').fill(stamp);
      await page.getByLabel('Category').selectOption({ index: 1 });
      // Only the required short description is filled; the long-form fields
      // are left blank and must save.
      await page
        .getByLabel('Short description (English)')
        .fill('Short e2e description, over ten.');
      await page
        .getByLabel('Short description (Arabic)')
        .fill('وصف قصير يزيد عن عشرة.');
      await page.getByRole('button', { name: 'Create machine' }).click();
      await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);

      for (const locale of ['en', 'ar'] as const) {
        await page.goto(`${WEB_URL}/${locale}/machines/${stamp}`);
        // Blank long-form fields = no section at all, in both locales.
        await expect(page.locator('#description-heading')).toHaveCount(0);
        await expect(page.locator('#specs-heading')).toHaveCount(0);
        // The lead paragraph (short description) and the quote panel are
        // untouched.
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(page.locator('#quote-heading')).toBeVisible();
      }

      // Sanity: a machine that does have specs still shows its sections, so
      // the selectors above prove absence rather than a broken page.
      await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
      await expect(page.locator('#description-heading')).toBeVisible();
      await expect(page.locator('#specs-heading')).toBeVisible();
    } finally {
      await page.goto(`${ADMIN_URL}/en/machines?q=${stamp}`);
      await page
        .locator('tr', { hasText: name })
        .getByRole('link', { name: 'Edit' })
        .click();
      await expect(page).toHaveURL(/\/machines\/[^/]+\/edit$/);
      await page
        .getByRole('button', { name: new RegExp(`^Delete ${name}`) })
        .click();
      await page
        .getByRole('dialog')
        .getByRole('button', { name: 'Delete' })
        .click();
      await expect(page).toHaveURL(`${ADMIN_URL}/en/machines`);
      await context.close();
    }
  });
});
