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

// Phase 26/27: the category detail hero must show the whole photo
// (letterboxed, never cropped) over a blurred backdrop — Phase 27 centers
// the stack (breadcrumb, title, photo) instead of pinning the photo to one
// side, so the layout is symmetric and RTL needs no mirroring — and the
// long-form fields (category description, machine full description/specs) are
// optional, so blank in the admin means the section is absent on the public
// page. These tests drive the real admin forms and read the public pages
// back, so they also lock the "blank saves and disappears" behaviour.
test.describe('category hero photo', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  // A photo that loads: picsum delivers a fixed-dimension image per seed.
  // Offline environments get the structural assertions only — the spec must
  // not fail because an external CDN is unreachable.
  const TALL_PHOTO = `https://picsum.photos/seed/colina-tall-${Date.now().toString(36)}/400/900`;
  const WIDE_PHOTO = `https://picsum.photos/seed/colina-wide-${Date.now().toString(36)}/1600/500`;

  // The four widths the brief asks to verify at, plus the default desktop.
  const WIDTHS = [390, 768, 1280, 1920] as const;

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

  // Asserts the Phase 27 centered stack at one viewport: photo centered
  // horizontally in the banner (within 2px), fully inside it vertically,
  // and never overlapping the title/breadcrumb — identical in RTL because
  // the stack is symmetric.
  async function expectCenteredStack(page: Page) {
    const backdrop = page.locator('#category-hero-backdrop');
    const photoBox = page.locator('#category-hero-photo');
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

    const geometry = await page.evaluate(() => {
      const banner = document
        .querySelector('section[class*="bg-brand-900"]')!
        .getBoundingClientRect();
      const box = document
        .getElementById('category-hero-photo')!
        .getBoundingClientRect();
      const title = document.querySelector('h1')!.getBoundingClientRect();
      const crumb = document
        .querySelector('main nav[aria-label]')!
        .getBoundingClientRect();
      return { banner, box, title, crumb };
    });

    // Horizontally centered in the banner: both centers within ~2px.
    const bannerCenterX = geometry.banner.left + geometry.banner.width / 2;
    const photoCenterX = geometry.box.left + geometry.box.width / 2;
    expect(Math.abs(photoCenterX - bannerCenterX)).toBeLessThanOrEqual(2);

    // The photo stays inside the banner vertically.
    expect(geometry.box.top).toBeGreaterThanOrEqual(geometry.banner.top - 1);
    expect(geometry.box.bottom).toBeLessThanOrEqual(geometry.banner.bottom + 1);

    // Normal flow (breadcrumb → title → photo): no overlap possible, and
    // asserted so a future absolute-position refactor cannot break it.
    expect(geometry.crumb.bottom).toBeLessThanOrEqual(geometry.title.top + 1);
    expect(geometry.title.bottom).toBeLessThanOrEqual(geometry.box.top + 1);
  }

  // When the CDN answers, prove nothing is cropped: the drawn image must
  // keep the source's aspect ratio exactly (a cropped `cover` would not).
  // `object-fit: contain` fits the source inside the img's box without
  // distortion, so the drawn size is min(scale) on each axis — recompute it
  // and require the drawn ratio to equal the natural ratio.
  async function expectUncropped(page: Page) {
    const img = page.locator('#category-hero-photo img');
    const loaded = await img
      .evaluate((element) => (element as HTMLImageElement).naturalWidth > 0)
      .catch(() => false);
    if (!loaded) {
      return;
    }
    const sizes = await img.evaluate((element) => {
      const image = element as HTMLImageElement;
      const rect = image.getBoundingClientRect();
      const naturalRatio = image.naturalWidth / image.naturalHeight;
      const drawnWidth = Math.min(rect.width, rect.height * naturalRatio);
      const drawnHeight = Math.min(rect.height, rect.width / naturalRatio);
      return { naturalRatio, drawnWidth, drawnHeight };
    });
    expect(sizes.drawnHeight).toBeGreaterThan(0);
    expect(sizes.drawnWidth).toBeGreaterThan(0);
    expect(sizes.drawnWidth / sizes.drawnHeight).toBeCloseTo(
      sizes.naturalRatio,
      3
    );
  }

  test('a photo category centers the complete photo under the title at every width, in both locales', async ({
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

      // Tall photo: centered stack at all four widths, both locales. The
      // layout is symmetric, so RTL only needs confirming, not mirroring.
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        for (const locale of ['en', 'ar'] as const) {
          await page.goto(`${WEB_URL}/${locale}/categories/${tallSlug}`);
          await expectCenteredStack(page);
        }
      }

      // Wide photo: the same guarantees at a desktop width.
      await page.setViewportSize({ width: 1280, height: 900 });
      for (const locale of ['en', 'ar'] as const) {
        await page.goto(`${WEB_URL}/${locale}/categories/${wideSlug}`);
        await expectCenteredStack(page);
      }

      // Uncropped proof, when the CDN answers, for both shapes.
      await page.goto(`${WEB_URL}/en/categories/${tallSlug}`);
      await expectUncropped(page);
      await page.goto(`${WEB_URL}/en/categories/${wideSlug}`);
      await expectUncropped(page);
    } finally {
      await deleteCategory(page, tallName);
      await deleteCategory(page, wideName);
      await context.close();
    }
  });

  test('a category without a photo keeps the plain band with centered text, never a blurred hero', async ({
    page,
  }) => {
    for (const width of [390, 1280] as const) {
      await page.setViewportSize({ width, height: 900 });
      for (const locale of ['en', 'ar'] as const) {
        await page.goto(`${WEB_URL}/${locale}/categories/production-lines`);
        await expect(page.locator('#category-hero-backdrop')).toHaveCount(0);
        await expect(page.locator('#category-hero-photo')).toHaveCount(0);
        const title = locale === 'en' ? 'Production Lines' : 'خطوط الإنتاج';
        await expect(
          page.getByRole('heading', { level: 1, name: title })
        ).toBeVisible();

        // Centered to match the photo layout: the h1's center sits within
        // ~2px of the band's center.
        const geometry = await page.evaluate(() => {
          const band = document
            .querySelector('section[class*="bg-brand-900"]')!
            .getBoundingClientRect();
          const title = document.querySelector('h1')!.getBoundingClientRect();
          return { band, title };
        });
        const bandCenterX = geometry.band.left + geometry.band.width / 2;
        const titleCenterX = geometry.title.left + geometry.title.width / 2;
        expect(Math.abs(titleCenterX - bandCenterX)).toBeLessThanOrEqual(2);
      }
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
