import { test, expect } from '@playwright/test';
import {
  cleanupFixtures,
  createMaintenanceCategory,
  createShowcase,
  deleteMaintenanceCategoriesByTag,
  deleteShowcasesByTag,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

const TAG = 'st28a';

const LINE_A_SLUG = `maint-line-a-${TAG}`;
const LINE_B_SLUG = `maint-line-b-${TAG}`;
const EMPTY_SLUG = `maint-empty-${TAG}`;

const LINE_A_EN = `Maintenance Line ${TAG} A`;
const LINE_A_AR = `خط صيانة ${TAG} أ`;
const LINE_A_DESC_EN = `Line A description ${TAG}`;
const LINE_A_DESC_AR = `وصف خط الصيانة أ ${TAG}`;

const LINE_B_EN = `Maintenance Line ${TAG} B`;
const LINE_B_AR = `خط صيانة ${TAG} ب`;

const EMPTY_EN = `Maintenance Empty Line ${TAG}`;
const EMPTY_AR = `خط صيانة فارغ ${TAG}`;

const ALPHA_EN = `Maintenance Machine ${TAG} Alpha`;
const ALPHA_AR = `ماكينة صيانة ${TAG} ألفا`;
const ALPHA_DESC_EN = `Alpha machine description ${TAG}`;
const ALPHA_DESC_AR = `وصف ماكينة ألفا ${TAG}`;
const BETA_EN = `Maintenance Machine ${TAG} Beta`;
const BETA_AR = `ماكينة صيانة ${TAG} بيتا`;
const GAMMA_EN = `Maintenance Machine ${TAG} Gamma`;
const GAMMA_AR = `ماكينة صيانة ${TAG} جاما`;
const DELTA_EN = `Maintenance Machine ${TAG} Delta`;
const DELTA_AR = `ماكينة صيانة ${TAG} دلتا`;
const OTHER_EN = `Maintenance Machine ${TAG} Other Line`;
const OTHER_AR = `ماكينة صيانة ${TAG} خط آخر`;
const ORPHAN_EN = `Maintenance Orphan ${TAG}`;
const ORPHAN_AR = `ماكينة صيانة يتيمة ${TAG}`;

const SLIDER = '[data-testid="before-after-slider"]';
const HANDLE = '[data-testid="before-after-handle"]';

const COPY = {
  en: {
    heading: 'Maintenance machines',
    lineHeading: 'Machines in this line',
    lineEmpty: 'No machines in this production line yet.',
    request: 'Request maintenance',
    more: 'More machines in this line',
    before: 'Before',
    after: 'After',
    fourMachines: '4 machines',
    oneMachine: '1 machine',
  },
  ar: {
    heading: 'ماكينات الصيانة',
    lineHeading: 'ماكينات هذا الخط',
    lineEmpty: 'لا توجد ماكينات في خط الإنتاج هذا بعد.',
    request: 'اطلب صيانة',
    more: 'المزيد من ماكينات هذا الخط',
    before: 'قبل',
    after: 'بعد',
    // ICU `few` for four: the exact digits are the formatter's business, the
    // noun is what proves the right plural branch was chosen.
    fourMachines: 'ماكينات',
    oneMachine: 'ماكينة واحدة',
  },
} as const;

const lineAName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? LINE_A_AR : LINE_A_EN;
const lineBName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? LINE_B_AR : LINE_B_EN;
const emptyName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? EMPTY_AR : EMPTY_EN;
const alphaName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? ALPHA_AR : ALPHA_EN;
const orphanName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? ORPHAN_AR : ORPHAN_EN;
const machineName = (locale: 'en' | 'ar', en: string, ar: string) =>
  locale === 'ar' ? ar : en;

// The generated ids are the machine URLs; cuid values cannot be predicted, so
// the fixtures hand them back.
let alphaId = '';
let otherId = '';
let orphanId = '';

function seed() {
  createMaintenanceCategory({
    slug: LINE_A_SLUG,
    nameEn: LINE_A_EN,
    nameAr: LINE_A_AR,
    descriptionEn: LINE_A_DESC_EN,
    descriptionAr: LINE_A_DESC_AR,
  });
  createMaintenanceCategory({
    slug: LINE_B_SLUG,
    nameEn: LINE_B_EN,
    nameAr: LINE_B_AR,
  });
  createMaintenanceCategory({
    slug: EMPTY_SLUG,
    nameEn: EMPTY_EN,
    nameAr: EMPTY_AR,
  });

  // Four machines: the detail page needs three "more" items besides the one
  // it shows. Alpha carries a description; the rest do not.
  alphaId = createShowcase({
    nameEn: ALPHA_EN,
    nameAr: ALPHA_AR,
    categorySlug: LINE_A_SLUG,
    descriptionEn: ALPHA_DESC_EN,
    descriptionAr: ALPHA_DESC_AR,
  });
  createShowcase({
    nameEn: BETA_EN,
    nameAr: BETA_AR,
    categorySlug: LINE_A_SLUG,
  });
  createShowcase({
    nameEn: GAMMA_EN,
    nameAr: GAMMA_AR,
    categorySlug: LINE_A_SLUG,
  });
  createShowcase({
    nameEn: DELTA_EN,
    nameAr: DELTA_AR,
    categorySlug: LINE_A_SLUG,
  });

  otherId = createShowcase({
    nameEn: OTHER_EN,
    nameAr: OTHER_AR,
    categorySlug: LINE_B_SLUG,
  });
  orphanId = createShowcase({
    nameEn: ORPHAN_EN,
    nameAr: ORPHAN_AR,
  });
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

for (const locale of ['en', 'ar'] as const) {
  for (const viewport of [
    { name: '1280px', width: 1280, height: 900 },
    { name: '390px', width: 390, height: 844 },
  ]) {
    test.describe(`${locale} at ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('the maintenance index lists qualifying lines as tiles', async ({
        page,
      }) => {
        await page.goto(`${WEB_URL}/${locale}/maintenance`);
        await expect(
          page.getByRole('heading', {
            name: COPY[locale].heading,
            level: 1,
          })
        ).toBeVisible();

        const lineA = page.locator(`a[href$="/maintenance/${LINE_A_SLUG}"]`);
        await expect(lineA).toHaveCount(1);
        await expect(lineA).toContainText(lineAName(locale));
        await expect(lineA).toContainText(COPY[locale].fourMachines);

        const lineB = page.locator(`a[href$="/maintenance/${LINE_B_SLUG}"]`);
        await expect(lineB).toHaveCount(1);
        await expect(lineB).toContainText(lineBName(locale));
        await expect(lineB).toContainText(COPY[locale].oneMachine);

        // A line with no machines is not a destination.
        await expect(page.getByText(emptyName(locale))).toHaveCount(0);
        // An uncategorized machine never reaches the public site.
        await expect(page.getByText(orphanName(locale))).toHaveCount(0);

        const overflow = await page.evaluate(() => ({
          scroll: document.documentElement.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(overflow.scroll).toBeLessThanOrEqual(overflow.client + 1);
      });

      test('the line page shows slider cards, names below the photos and links to details', async ({
        page,
      }) => {
        await page.goto(`${WEB_URL}/${locale}/maintenance/${LINE_A_SLUG}`);
        await expect(
          page.getByRole('heading', {
            name: lineAName(locale),
            level: 1,
          })
        ).toBeVisible();
        await expect(
          page.getByText(locale === 'ar' ? LINE_A_DESC_AR : LINE_A_DESC_EN)
        ).toBeVisible();
        await expect(
          page.getByRole('heading', {
            name: COPY[locale].lineHeading,
            level: 2,
          })
        ).toBeVisible();

        // Four comparisons, each starting in the middle.
        await expect(page.getByRole('slider')).toHaveCount(4);
        for (let index = 0; index < 4; index += 1) {
          await expect(page.getByRole('slider').nth(index)).toHaveAttribute(
            'aria-valuenow',
            '50'
          );
        }

        // The name is a link BELOW the photo, not an overlay on it.
        const firstCard = page.locator('main article').first();
        await firstCard.scrollIntoViewIfNeeded();
        const sliderBox = (await firstCard.locator(SLIDER).boundingBox())!;
        const nameLink = firstCard.getByRole('link');
        await expect(nameLink).toBeVisible();
        await expect(nameLink).toHaveAttribute(
          'href',
          new RegExp(`/maintenance/${LINE_A_SLUG}/[^/]+$`)
        );
        const linkBox = (await nameLink.boundingBox())!;
        expect(linkBox.y).toBeGreaterThanOrEqual(
          sliderBox.y + sliderBox.height - 1
        );

        // Before is physically left of After in both locales: the comparison
        // does not mirror with the text direction.
        const firstSlider = firstCard.locator(SLIDER);
        const before = firstSlider.getByText(COPY[locale].before, {
          exact: true,
        });
        const after = firstSlider.getByText(COPY[locale].after, {
          exact: true,
        });
        await expect(before).toBeVisible();
        await expect(after).toBeVisible();
        const beforeBox = (await before.boundingBox())!;
        const afterBox = (await after.boundingBox())!;
        expect(beforeBox.x).toBeLessThan(afterBox.x);

        // Dragging a card's handle commits a new aria-valuenow.
        const handle = firstCard.locator(HANDLE);
        const y = sliderBox.y + sliderBox.height / 2;
        await page.mouse.move(sliderBox.x + sliderBox.width / 2, y);
        await page.mouse.down();
        await page.mouse.move(sliderBox.x + sliderBox.width * 0.25, y, {
          steps: 10,
        });
        await page.mouse.up();
        await expect(handle).toHaveAttribute('aria-valuenow', '25');

        // An uncategorized machine never appears on the line page either.
        await expect(page.getByText(orphanName(locale))).toHaveCount(0);
      });

      test('the machine page shows one h1, a working large slider and the request button', async ({
        page,
      }) => {
        await page.goto(
          `${WEB_URL}/${locale}/maintenance/${LINE_A_SLUG}/${alphaId}`
        );

        // Exactly one h1: the machine name.
        await expect(page.locator('h1')).toHaveCount(1);
        await expect(page.locator('h1')).toHaveText(alphaName(locale));

        const slider = page.locator(SLIDER).first();
        await expect(page.locator(SLIDER)).toHaveCount(4);
        await slider.scrollIntoViewIfNeeded();
        const handle = page.locator(HANDLE).first();
        await expect(handle).toHaveAttribute('aria-valuenow', '50');

        // The frame is the promised 4:3 and comfortably large on desktop;
        // the keyboard moves the divider, which is the same contract as a drag.
        const box = (await slider.boundingBox())!;
        expect(Math.abs(box.width / box.height - 4 / 3)).toBeLessThan(0.05);
        expect(box.width).toBeGreaterThan(300);
        await handle.focus();
        await page.keyboard.press('ArrowRight');
        await expect(handle).toHaveAttribute('aria-valuenow', '55');
        await page.keyboard.press('ArrowLeft');
        await expect(handle).toHaveAttribute('aria-valuenow', '50');

        // The optional description is shown under the comparison.
        await expect(
          page.getByText(locale === 'ar' ? ALPHA_DESC_AR : ALPHA_DESC_EN)
        ).toBeVisible();

        // The request button is a locale-aware link to the existing form.
        await expect(
          page.getByRole('link', { name: COPY[locale].request })
        ).toHaveAttribute('href', /\/services#maintenance-form-heading$/);

        // More machines: up to three, never the current one.
        const more = page.locator(
          'section[aria-labelledby="more-maintenance-heading"]'
        );
        await expect(
          more.getByRole('heading', {
            name: COPY[locale].more,
            level: 2,
          })
        ).toBeVisible();
        await expect(more.getByRole('link')).toHaveCount(3);
        await expect(more.locator(`a[href$="/${alphaId}"]`)).toHaveCount(0);
        await expect(
          more.getByText(machineName(locale, BETA_EN, BETA_AR))
        ).toBeVisible();
        await expect(
          more.getByText(machineName(locale, GAMMA_EN, GAMMA_AR))
        ).toBeVisible();
        await expect(
          more.getByText(machineName(locale, DELTA_EN, DELTA_AR))
        ).toBeVisible();
      });
    });
  }
}

test.describe('guards', () => {
  test('an unknown line slug is a 404', async ({ page }) => {
    const response = await page.goto(
      `${WEB_URL}/en/maintenance/does-not-exist-${TAG}`
    );
    expect(response?.status()).toBe(404);
  });

  test('a line with no machines shows the neutral empty message', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/maintenance/${EMPTY_SLUG}`);
    await expect(
      page.getByRole('heading', { name: EMPTY_EN, level: 1 })
    ).toBeVisible();
    await expect(page.getByText(COPY.en.lineEmpty)).toBeVisible();
    await expect(page.locator(SLIDER)).toHaveCount(0);
  });

  test('an unknown machine id is a 404', async ({ page }) => {
    const response = await page.goto(
      `${WEB_URL}/en/maintenance/${LINE_A_SLUG}/does-not-exist-${TAG}`
    );
    expect(response?.status()).toBe(404);
  });

  test('a machine id from another line is a 404', async ({ page }) => {
    const response = await page.goto(
      `${WEB_URL}/en/maintenance/${LINE_B_SLUG}/${alphaId}`
    );
    expect(response?.status()).toBe(404);
  });

  test('an uncategorized machine has no public detail page', async ({
    page,
  }) => {
    const response = await page.goto(
      `${WEB_URL}/en/maintenance/${LINE_A_SLUG}/${orphanId}`
    );
    expect(response?.status()).toBe(404);

    // It is not on the line page either.
    await page.goto(`${WEB_URL}/en/maintenance/${LINE_A_SLUG}`);
    await expect(page.getByText(ORPHAN_EN)).toHaveCount(0);
  });

  test('the other line’s machine is reachable from its own line', async ({
    page,
  }) => {
    // A small positive control for the wrong-category 404 above: the same id
    // is a real page under the line it actually belongs to.
    const response = await page.goto(
      `${WEB_URL}/en/maintenance/${LINE_B_SLUG}/${otherId}`
    );
    expect(response?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText(OTHER_EN);
  });
});
