import { test, expect } from '@playwright/test';
import {
  SHOWCASE_PHOTOS,
  cleanupFixtures,
  createShowcase,
  deleteShowcasesByTag,
  runInDbValue,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Every row this file creates carries the fixture tag in its name, so the run
// leaves the database as it found it and a leftover from a crashed run is
// identifiable by eye.
const TAG = 'st28a';
const NAME_EN = `Home Showcase ${TAG} Alpha`;
const NAME_AR = `ماكينة عرض ${TAG}`;

const SLIDER = '[data-testid="before-after-slider"]';
const HANDLE = '[data-testid="before-after-handle"]';

const COPY = {
  en: { before: 'Before', after: 'After', heading: 'Maintenance machines' },
  ar: { before: 'قبل', after: 'بعد', heading: 'ماكينات الصيانة' },
} as const;

/** Creates the one comparison these specs need, once per run. */
function ensureFixtures() {
  createShowcase({ nameEn: NAME_EN, nameAr: NAME_AR });
}

/** The name the card prints in each locale. */
const displayName = (locale: 'en' | 'ar') =>
  locale === 'ar' ? NAME_AR : NAME_EN;

/**
 * How many showcase rows are NOT this spec's fixtures.
 *
 * The empty-state test needs a table with nothing in it, and this is how it
 * checks that emptying it is within its own rights before it does.
 */
function countUntagged(): number {
  return (
    runInDbValue<number>(`
    return await prisma.maintenanceShowcase.count({
      where: {
        NOT: {
          OR: [
            { nameEn: { contains: ${JSON.stringify(TAG)} } },
            { nameAr: { contains: ${JSON.stringify(TAG)} } },
          ],
        },
      },
    });
  `) ?? -1
  );
}

/**
 * Opens the home page with the section scrolled into view and both photos
 * actually fetched.
 *
 * Three things have to be settled before any of this can be measured, and
 * each one failed silently the first time round:
 *
 * - The brand overlay covers the page for the first second and would swallow
 *   every hit-test, so it has to have lifted.
 * - `elementFromPoint` takes VIEWPORT coordinates, and the section sits below
 *   the fold, so an un-scrolled point resolves to nothing at all.
 * - Both images are lazy (they are below the fold by design), so
 *   `naturalWidth` is 0 until the browser decides to fetch them.
 */
async function openSection(
  page: import('@playwright/test').Page,
  locale: string
) {
  await page.goto(`${WEB_URL}/${locale}`);
  await expect(
    page.locator('section[aria-labelledby="maintenance-showcase-heading"]')
  ).toHaveCount(1);
  await expect(page.locator('[data-testid="intro-overlay"]')).toHaveCount(0, {
    timeout: 15_000,
  });
  const slider = page.locator(SLIDER);
  await slider.scrollIntoViewIfNeeded();
  await page.waitForFunction(
    () =>
      [
        ...document.querySelectorAll('[data-testid="before-after-slider"] img'),
      ].every((img) => img.complete && img.naturalWidth > 0) &&
      document.querySelectorAll('[data-testid="before-after-slider"] img')
        .length === 2
  );
  return slider;
}

test.beforeAll(() => {
  cleanupFixtures(TAG);
  ensureFixtures();
});

test.afterAll(() => {
  deleteShowcasesByTag(TAG);
  cleanupFixtures(TAG);
});

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

  test('with an empty table the section is not rendered at all', async ({
    page,
  }) => {
    // The home page's query has no filter — it takes the newest N rows of
    // whatever is in the table — so the only honest way to see the section gone
    // is a table with nothing in it. This spec's own fixtures are therefore
    // removed for the duration, and put back afterwards.
    //
    // Verified against the DEV server, which re-renders the page per request.
    // The home page is ISR-cached (`revalidate = 3600`), so the same assertion
    // against a production build would be reading a cached page and would need
    // a cache purge first; that is why this is a dev-server test.
    const section = page.locator(
      'section[aria-labelledby="maintenance-showcase-heading"]'
    );

    // If anything untagged is in the table, removing it would be reaching
    // outside this spec's own fixtures. Say so rather than quietly deleting it.
    const strays = countUntagged();
    if (strays !== 0) {
      test.skip(
        true,
        strays > 0
          ? `colina_test holds ${strays} untagged MaintenanceShowcase row(s); an empty table cannot be produced without deleting data this spec does not own`
          : 'could not read the MaintenanceShowcase table'
      );
    }

    try {
      deleteShowcasesByTag(TAG);
      await expect(page.locator('body')).toBeVisible();
      await page.goto(`${WEB_URL}/en`);
      await expect(
        page.locator('[data-testid="before-after-slider"]')
      ).toHaveCount(0);
      // Not merely an empty grid: no section, no heading, no gap.
      await expect(section).toHaveCount(0);
      await expect(
        page.getByRole('heading', { name: 'Maintenance machines' })
      ).toHaveCount(0);
      // ...and the page around it is untouched.
      await expect(page.locator('#categories-heading')).toBeAttached();
    } finally {
      // Put it back so the rest of the run is unaffected whatever happened.
      ensureFixtures();
    }
  });
});

// Both locales, both widths: the section has to read as one page in Arabic on
// a phone, and the slider is a pointer-driven control, so the two viewport
// sizes are where a layout mistake would show up first.
for (const locale of ['en', 'ar'] as const) {
  for (const viewport of [
    { name: '1280px', width: 1280, height: 900 },
    { name: '390px', width: 390, height: 844 },
  ]) {
    test.describe(`${locale} at ${viewport.name}`, () => {
      test.use({
        viewport: { width: viewport.width, height: viewport.height },
      });

      test('the section sits below the categories and shows the item', async ({
        page,
      }) => {
        await page.goto(`${WEB_URL}/${locale}`);
        const section = page.locator(
          'section[aria-labelledby="maintenance-showcase-heading"]'
        );
        await expect(section).toHaveCount(1);

        // Directly below the categories section in DOM order — not merely
        // somewhere further down the page.
        const follows = await page.evaluate(() => {
          const categories = document.querySelector(
            '[aria-labelledby="categories-heading"]'
          );
          const maintenance = document.querySelector(
            '[aria-labelledby="maintenance-showcase-heading"]'
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
        // The card prints the name in the page's language, so an Arabic page
        // must show the Arabic row and not quietly fall back to the English.
        await expect(section.getByText(displayName(locale))).toBeVisible();
      });

      test('"Before" is physically left of "After" in both locales', async ({
        page,
      }) => {
        await page.goto(`${WEB_URL}/${locale}`);
        const before = page.locator(SLIDER).getByText(COPY[locale].before, {
          exact: true,
        });
        const after = page.locator(SLIDER).getByText(COPY[locale].after, {
          exact: true,
        });
        await expect(before).toBeVisible();
        await expect(after).toBeVisible();

        const boxOf = async (locator: typeof before) => {
          const box = await locator.boundingBox();
          expect(box, 'label has no box').not.toBeNull();
          return box!;
        };
        // The labels do NOT follow the text direction: the comparison reads
        // the same way in Arabic, so before is on the left regardless.
        expect((await boxOf(before)).x).toBeLessThan((await boxOf(after)).x);
      });

      test('the slider starts in the middle and both photos are rendered', async ({
        page,
      }) => {
        await openSection(page, locale);
        const handle = page.locator(HANDLE);
        await expect(handle).toHaveAttribute('aria-valuenow', '50');
        await expect(handle).toHaveAttribute('aria-valuemin', '0');
        await expect(handle).toHaveAttribute('aria-valuemax', '100');
        await expect(handle).toHaveAttribute('aria-orientation', 'horizontal');
        // A localized value text, not a bare number.
        await expect(handle).toHaveAttribute('aria-valuetext', /\d+%.*/);

        // Two real, DECODED images rather than two broken ones, and the right
        // one in the right layer. A broken URL would still be two <img> tags,
        // which is why the intrinsic widths are the thing asserted — and they
        // differ, so a layer holding the other's photo would be caught too.
        // `openSection` waits for the lazy fetch first.
        const images = page.locator(`${SLIDER} img`);
        await expect(images).toHaveCount(2);
        await expect(images.nth(0)).toHaveAttribute(
          'src',
          SHOWCASE_PHOTOS.before
        );
        await expect(images.nth(1)).toHaveAttribute(
          'src',
          SHOWCASE_PHOTOS.after
        );
        for (const [index, width] of [
          [0, SHOWCASE_PHOTOS.beforeWidth],
          [1, SHOWCASE_PHOTOS.afterWidth],
        ] as const) {
          expect(
            await images
              .nth(index)
              .evaluate((el) => (el as HTMLImageElement).naturalWidth)
          ).toBe(width);
        }
      });

      test('the divider starts centred and the AFTER layer is clipped', async ({
        page,
      }) => {
        const slider = await openSection(page, locale);
        const box = (await slider.boundingBox())!;

        // The CSS variable is the contract between the script and the clip.
        await expect(slider).toHaveCSS('--pos', '50%');

        const handleBox = (await page.locator(HANDLE).boundingBox())!;
        const centre = box.x + box.width / 2;
        expect(
          Math.abs(handleBox.x + handleBox.width / 2 - centre)
        ).toBeLessThan(3);

        // The AFTER layer is the one carrying the clip.
        const clip = await page
          .locator(`${SLIDER} img`)
          .nth(1)
          .evaluate((el) => getComputedStyle(el).clipPath);
        expect(clip).toContain('50%');
      });

      test('the name strip does not intercept pointer events', async ({
        page,
      }) => {
        const slider = await openSection(page, locale);
        const box = (await slider.boundingBox())!;
        const name = displayName(locale);

        // A point low in the tile, inside the strip.
        const hit = await page.evaluate(
          ({ x, y }) => {
            const el = document.elementFromPoint(x, y);
            return {
              tag: el?.tagName ?? '',
              inSlider: Boolean(
                el?.closest('[data-testid="before-after-slider"]')
              ),
            };
          },
          { x: box.x + box.width / 2, y: box.y + box.height - 12 }
        );
        expect(hit.inSlider, `hit ${hit.tag} inside the slider`).toBe(true);

        // And the strip itself is transparent to the pointer, so a drag that
        // crosses it keeps moving the divider. The strip is a SIBLING of the
        // slider inside the card, not a child of it, so it is reached from the
        // card rather than from the slider.
        const card = page
          .locator('section[aria-labelledby="maintenance-showcase-heading"] li')
          .filter({ hasText: name });
        await expect(card.locator('p')).toHaveCSS('pointer-events', 'none');
        await expect(card.getByText(name, { exact: false })).toBeVisible();
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

// The pointer and keyboard behaviour is asserted once per viewport rather than
// per locale pair: it is the same component either way, and the locale-specific
// half (which side "before" is on, and that the keys do not mirror) is covered
// above plus in the keyboard block, which does run in both.
for (const viewport of [
  { name: '1280px', width: 1280, height: 900 },
  { name: '390px', width: 390, height: 844 },
]) {
  test.describe(`dragging at ${viewport.name}`, () => {
    test.use({ viewport: { width: viewport.width, height: viewport.height } });

    test('dragging the handle moves the divider, handle and clip together', async ({
      browser,
    }) => {
      const page = await browser.newPage();
      const slider = await openSection(page, 'en');
      const handle = page.locator(HANDLE);
      const box = (await slider.boundingBox())!;
      const y = box.y + box.height / 2;

      const handleCentreX = async () => {
        const b = (await handle.boundingBox())!;
        return b.x + b.width / 2;
      };

      const startX = await handleCentreX();
      const afterImageClip = () =>
        page
          .locator(`${SLIDER} img`)
          .nth(1)
          .evaluate((el) => getComputedStyle(el).clipPath);

      // Drag to roughly a quarter.
      await page.mouse.move(startX, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.25, y, { steps: 10 });
      await page.mouse.up();

      await expect(handle).toHaveAttribute('aria-valuenow', '25');
      expect(await afterImageClip()).toContain('25%');
      const at25 = await handleCentreX();
      expect(Math.abs(at25 - (box.x + box.width * 0.25))).toBeLessThan(3);
      expect(at25).toBeLessThan(startX);

      // And on to roughly three quarters.
      await page.mouse.move(at25, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.75, y, { steps: 10 });
      await page.mouse.up();

      await expect(handle).toHaveAttribute('aria-valuenow', '75');
      expect(await afterImageClip()).toContain('75%');
      const at75 = await handleCentreX();
      expect(Math.abs(at75 - (box.x + box.width * 0.75))).toBeLessThan(3);
      expect(at75).toBeGreaterThan(at25);

      await page.close();
    });

    test('clicking anywhere on the photo jumps the divider there', async ({
      browser,
    }) => {
      const page = await browser.newPage();
      const slider = await openSection(page, 'en');
      const box = (await slider.boundingBox())!;

      await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
      await expect(page.locator(HANDLE)).toHaveAttribute('aria-valuenow', '20');

      await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);
      await expect(page.locator(HANDLE)).toHaveAttribute('aria-valuenow', '90');

      await page.close();
    });

    test('dragging past either edge clamps to 0 and 100', async ({
      browser,
    }) => {
      const page = await browser.newPage();
      const slider = await openSection(page, 'en');
      const box = (await slider.boundingBox())!;
      const y = box.y + box.height / 2;

      // Far to the left of the tile, then far to the right — the pointer is
      // outside the box for most of the drag, which is the case that has to
      // stop at the edge instead of running off it.
      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x - 600, y, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator(HANDLE)).toHaveAttribute('aria-valuenow', '0');

      await page.mouse.move(box.x + box.width / 2, y);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width + 600, y, { steps: 10 });
      await page.mouse.up();
      await expect(page.locator(HANDLE)).toHaveAttribute(
        'aria-valuenow',
        '100'
      );

      // The divider is still where it should be, inside the tile.
      await expect(slider).toHaveCSS('--pos', '100%');
      await page.close();
    });

    test('the page does not scroll while a horizontal drag is in progress', async ({
      browser,
    }) => {
      const page = await browser.newPage();
      const slider = await openSection(page, 'en');
      const box = (await slider.boundingBox())!;
      const before = await page.evaluate(() => window.scrollY);

      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(
        box.x + box.width / 2 + 120,
        box.y + box.height / 2,
        {
          steps: 8,
        }
      );
      await page.mouse.up();

      expect(await page.evaluate(() => window.scrollY)).toBe(before);
      await page.close();
    });
  });
}

for (const locale of ['en', 'ar'] as const) {
  test.describe(`keyboard in ${locale}`, () => {
    test.use({ viewport: { width: 1280, height: 900 } });

    test('the handle is reachable and every key does what it should', async ({
      page,
    }) => {
      const slider = await openSection(page, locale);
      const handle = page.locator(HANDLE);
      await handle.focus();
      await expect(handle).toBeFocused();

      // ArrowRight / ArrowLeft move by 5 — physically right and left in BOTH
      // locales, because the comparison does not mirror.
      await page.keyboard.press('ArrowRight');
      await expect(handle).toHaveAttribute('aria-valuenow', '55');
      await page.keyboard.press('ArrowLeft');
      await expect(handle).toHaveAttribute('aria-valuenow', '50');
      await page.keyboard.press('ArrowLeft');
      await expect(handle).toHaveAttribute('aria-valuenow', '45');

      // Shift makes the step 20.
      await page.keyboard.press('Shift+ArrowRight');
      await expect(handle).toHaveAttribute('aria-valuenow', '65');
      await page.keyboard.press('Shift+ArrowLeft');
      await expect(handle).toHaveAttribute('aria-valuenow', '45');

      // Home and End go to the edges.
      await page.keyboard.press('Home');
      await expect(handle).toHaveAttribute('aria-valuenow', '0');
      await page.keyboard.press('End');
      await expect(handle).toHaveAttribute('aria-valuenow', '100');

      // ...and nothing goes past them.
      await page.keyboard.press('End');
      await expect(handle).toHaveAttribute('aria-valuenow', '100');
      await page.keyboard.press('ArrowRight');
      await expect(handle).toHaveAttribute('aria-valuenow', '100');

      // A keypress moves the clip as well as the reported value. The evaluate is
      // awaited first: `expect` does not unwrap a promise, and `toContain` on
      // an unresolved promise throws "received is not iterable".
      await page.keyboard.press('Home');
      await expect(handle).toHaveAttribute('aria-valuenow', '0');
      await expect(page.locator(SLIDER)).toHaveCSS('--pos', '0%');
      const clip = await page
        .locator(`${SLIDER} img`)
        .nth(1)
        .evaluate((el) => getComputedStyle(el).clipPath);
      expect(clip).toContain('0%');
    });

    test('a keypress never scrolls the page sideways', async ({ page }) => {
      await openSection(page, locale);
      await page.locator(HANDLE).focus();
      await page.keyboard.press('ArrowLeft');
      await page.keyboard.press('ArrowLeft');
      expect(await page.evaluate(() => window.scrollX)).toBe(0);
      await expect(page.locator(HANDLE)).toHaveAttribute('aria-valuenow', '40');
    });
  });
}

test.describe('touch', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test('the container allows vertical panning, so a swipe still scrolls', async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    const slider = await openSection(page, 'en');

    // `pan-y` — not `none`. A touch-action of `none` would make a vertical
    // swipe over a comparison a dead zone that neither moves the divider nor
    // scrolls the page, which on a phone is the worst of both.
    const touchAction = await slider.evaluate(
      (el) => getComputedStyle(el).touchAction
    );
    expect(touchAction).toContain('pan-y');
    expect(touchAction).not.toContain('none');

    await context.close();
  });

  test('a tap moves the divider to the tapped point', async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
    });
    const page = await context.newPage();
    const slider = await openSection(page, 'en');
    const box = (await slider.boundingBox())!;

    // A plain tap, which is a pointerdown/pointerup at one place: the divider
    // jumps there. Driven with real touch events so the touch-action contract
    // is exercised rather than assumed.
    await page.touchscreen.tap(box.x + box.width * 0.3, box.y + box.height / 2);
    await expect(page.locator(HANDLE)).toHaveAttribute('aria-valuenow', '30');

    await context.close();
  });
});
