import { test, expect, type Locator, type Page } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  widePhoto,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const en = copyFor('en');

// A machine known to be alone in its category (Conveying Systems holds only
// Colina Belt 500) and one category that holds more than one machine.
const LONE_MACHINE = '/machines/colina-belt-500';
const SHARED_CATEGORY = '/categories/production-lines';

const STAMP = Date.now().toString(36);
const TAG = 'st28a';
// A category with a photo holding two machines that also have photos: the only
// way to assert "the photo is shown complete" is against a card that has one,
// since nothing in the seed carries an image.
const TILES = `${TAG}-tiles-${STAMP}`;
const TILES_NAME_EN = `Fixtures ${STAMP}`;
const TILES_NAME_AR = `فئات ${STAMP}`;
const MACHINE_A = `${TAG}-alpha-${STAMP}`;
const MACHINE_B = `${TAG}-beta-${STAMP}`;
const MACHINE_A_EN = `Alpha Line ${STAMP}`;
// Deliberately much longer, so it clamps and the footer still lines up.
const MACHINE_B_EN = `Beta Line ${STAMP} With A Deliberately Long Name`;
// A category with nothing in it, for the empty state.
const EMPTY = `${TAG}-empty-${STAMP}`;

/**
 * Asserts a card/tile photo is rendered COMPLETE rather than cropped.
 *
 * Three separate claims, because any one of them alone is satisfiable by a
 * broken layout:
 *  1. `object-fit` really computes to `contain`;
 *  2. the element's box sits strictly inside its image area, with a real inset,
 *     so the wrapper's padding is applied and the photo touches no edge;
 *  3. the PAINTED image keeps the source's aspect ratio and is strictly shorter
 *     than the box — which is what letterboxing looks like. `cover` would fill
 *     the box height and crop the width, so claim 3 is what actually rules out
 *     cropping; claims 1 and 2 only rule out the obvious variants.
 */
async function expectCompleteImage(image: Locator) {
  const info = await image.evaluate((element) => {
    const img = element as HTMLImageElement;
    const area = img.parentElement!.getBoundingClientRect();
    const box = img.getBoundingClientRect();
    return {
      objectFit: getComputedStyle(img).objectFit,
      naturalWidth: img.naturalWidth,
      naturalHeight: img.naturalHeight,
      area: {
        top: area.top,
        bottom: area.bottom,
        left: area.left,
        right: area.right,
      },
      box: {
        top: box.top,
        bottom: box.bottom,
        left: box.left,
        right: box.right,
        width: box.width,
        height: box.height,
      },
    };
  });

  expect(info.objectFit).toBe('contain');

  // Inside the image area...
  expect(info.box.top).toBeGreaterThanOrEqual(info.area.top - 0.5);
  expect(info.box.bottom).toBeLessThanOrEqual(info.area.bottom + 0.5);
  expect(info.box.left).toBeGreaterThanOrEqual(info.area.left - 0.5);
  expect(info.box.right).toBeLessThanOrEqual(info.area.right + 0.5);
  // ...and strictly inside it, so the wrapper's padding is really applied.
  expect(info.box.top).toBeGreaterThan(info.area.top + 0.5);
  expect(info.box.left).toBeGreaterThan(info.area.left + 0.5);

  // The fixtures are 4:1 photographs in a 4:3 frame, so a complete picture is
  // width-limited and letterboxed top and bottom.
  expect(info.naturalWidth).toBeGreaterThan(0);
  const naturalRatio = info.naturalWidth / info.naturalHeight;
  const scale = Math.min(
    info.box.width / info.naturalWidth,
    info.box.height / info.naturalHeight
  );
  const paintedWidth = info.naturalWidth * scale;
  const paintedHeight = info.naturalHeight * scale;
  expect(paintedHeight).toBeGreaterThan(0);
  expect(paintedWidth / paintedHeight).toBeCloseTo(naturalRatio, 3);
  expect(paintedWidth).toBeLessThanOrEqual(info.box.width + 1);
  expect(paintedHeight).toBeLessThanOrEqual(info.box.height + 1);
  // Strictly shorter than the frame: `cover` would fill this and crop instead.
  expect(paintedHeight).toBeLessThan(info.box.height - 1);
}

/**
 * Every card in one grid row is exactly as tall as its neighbours.
 *
 * Grouped by vertical position rather than by index, because a grid reflows:
 * at 390px the cards stack and each is its own row, at 1280px they sit three or
 * four abreast. Comparing within a row is the claim that actually matters —
 * a ragged bottom edge.
 */
async function expectEqualHeightsInRows(cards: Locator) {
  const heights = await cards.evaluateAll((elements) =>
    elements.map((el) => {
      const rect = el.getBoundingClientRect();
      return { top: Math.round(rect.top), height: rect.height };
    })
  );
  expect(heights.length).toBeGreaterThan(1);
  const rows = new Map<number, number[]>();
  for (const { top, height } of heights) {
    rows.set(top, [...(rows.get(top) ?? []), height]);
  }
  for (const rowHeights of rows.values()) {
    // Only meaningful where the grid is multi-column. Below `sm` each card is
    // its own row, so the loop asserts nothing — which is correct, not a gap:
    // a single column cannot be ragged.
    if (rowHeights.length < 2) continue;
    // Sub-pixel rounding of the grid gap can leave a hair of difference; what
    // must never happen is a card that is visibly taller or shorter.
    expect(
      Math.max(...rowHeights) - Math.min(...rowHeights)
    ).toBeLessThanOrEqual(1);
  }
}

test.beforeAll(() => {
  const photo = widePhoto();
  createCategory({
    slug: TILES,
    nameEn: TILES_NAME_EN,
    nameAr: TILES_NAME_AR,
    descriptionEn: 'A category created only to be looked at by these tests.',
    descriptionAr: 'فئة أُنشئت ل[this] الاختبارات فقط.',
    image: photo,
  });
  createCategory({
    slug: EMPTY,
    nameEn: `Nothing Here ${STAMP}`,
    nameAr: `لا شيء ${STAMP}`,
  });
  createMachine({
    slug: MACHINE_A,
    nameEn: MACHINE_A_EN,
    nameAr: `خط ألفا ${STAMP}`,
    shortDescriptionEn: 'A short summary of the alpha line.',
    shortDescriptionAr: 'وصف قصير لخط ألفا.',
    categorySlug: TILES,
    imageUrl: photo,
  });
  createMachine({
    slug: MACHINE_B,
    nameEn: MACHINE_B_EN,
    nameAr: `خط بيتا ${STAMP}`,
    shortDescriptionEn: 'A short summary of the beta line.',
    shortDescriptionAr: 'وصف قصير لخط بيتا.',
    categorySlug: TILES,
    imageUrl: photo,
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

test.describe('catalog browsing flow', () => {
  test('the categories index shows every category, named on the tile itself', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/categories`);
    await expect(
      page.getByRole('heading', { level: 1, name: 'Product Categories' })
    ).toBeVisible();

    const cards = page.locator('main ul li a[href^="/en/categories/"]');
    const count = await cards.count();
    expect(count).toBeGreaterThan(0);

    // Each card is a link through to its own category page.
    const first = cards.first();
    await expect(first).toHaveAttribute('href', /^\/en\/categories\/[^/]+$/);
    // ...and every card carries its name on the tile. Nothing else: the tile is
    // a photo, a scrim, an icon and the name.
    for (const card of await cards.all()) {
      const name = await card.getAttribute('aria-label');
      expect(name).toBeTruthy();
      await expect(card.getByRole('heading')).toHaveText(name!);
      expect(((await card.textContent()) ?? '').trim()).toBe(name);
    }
  });

  test('a category card opens its own detail page', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/categories`);
    await page.locator('main ul li a[href^="/en/categories/"]').first().click();
    await page.waitForURL(/\/en\/categories\/[^/]+$/);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  });

  for (const locale of ['en', 'ar'] as const) {
    test(`${locale}: a category page opens with a breadcrumb and a machine grid`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}${SHARED_CATEGORY}`);

      const trail = page.getByRole('navigation', {
        name: locale === 'ar' ? 'مسار التنقل' : 'Breadcrumb',
      });
      await expect(trail).toBeVisible();
      // The last crumb is the current page and is not a link.
      await expect(trail.locator('[aria-current="page"]')).toHaveCount(1);

      // Machines are listed as photo+name cards that link to their own page.
      const cards = page.locator('main ul li a[href*="/machines/"]');
      expect(await cards.count()).toBeGreaterThan(0);
      for (const href of await cards.evaluateAll((as) =>
        as.map((a) => a.getAttribute('href'))
      )) {
        expect(href).toMatch(new RegExp(`^/${locale}/machines/[^/]+$`));
      }
    });
  }

  // A category with nothing in it must not render a bare heading over nothing.
  // Uses a fixture of its own rather than a leftover row, so the test says
  // something about the page and not about whatever a previous run left behind.
  test('a category with no machines shows its empty state', async ({
    page,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}/categories/${EMPTY}`);
      const main = page.getByRole('main');
      if (locale === 'en') {
        await expect(main).toContainText('No machines in this category yet.');
      } else {
        await expect(main).toContainText('لا توجد آلات في هذه الفئة بعد.');
      }
      await expect(page.locator('#related-heading')).toHaveCount(0);
    }
  });

  test('the breadcrumb separator never reverses the page into a sideways scroll', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/ar/categories/production-lines`);
    const widths = await page.evaluate(() => ({
      scroll: document.scrollingElement!.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
  });
});

/**
 * Asserts one tile's shape, scrim and centred white name.
 *
 * The scrim is found by colour rather than by a test id, so it cannot drift out
 * of step with the markup: any child painted `rgba(0, 0, 0, 0.6)` is the
 * overlay, and the test additionally requires it to cover the tile.
 */
async function expectSquareTileWithCenteredName(tile: Locator) {
  const shape = await tile.evaluate((el) => {
    const rect = el.getBoundingClientRect();
    const name = el.querySelector('h3')!;
    const nameRect = name.getBoundingClientRect();
    const style = getComputedStyle(name);

    // The overlay: a child painted a translucent black over the whole tile.
    const overlay = Array.from(el.querySelectorAll('div')).find((child) => {
      const bg = getComputedStyle(child).backgroundColor;
      return /^rgba\(0,\s*0,\s*0,\s*0?\.?\d+\)$/.test(bg);
    });
    const overlayRect = overlay?.getBoundingClientRect();

    return {
      width: rect.width,
      height: rect.height,
      hasPhoto: el.querySelector('img') !== null,
      nameColor: style.color,
      nameCentreX: nameRect.left + nameRect.width / 2,
      nameCentreY: nameRect.top + nameRect.height / 2,
      tileCentreX: rect.left + rect.width / 2,
      tileCentreY: rect.top + rect.height / 2,
      boxShadow: getComputedStyle(el).boxShadow,
      overlay: overlayRect
        ? {
            width: overlayRect.width,
            height: overlayRect.height,
          }
        : null,
    };
  });

  // Roughly square: within 5% on each axis.
  expect(
    Math.abs(shape.width - shape.height) / shape.width
  ).toBeLessThanOrEqual(0.05);
  expect(shape.width).toBeGreaterThan(0);

  // No card: the tile is flat, with no drop shadow and no border.
  expect(['none', '']).toContain(shape.boxShadow);

  // The name is white, wherever it sits.
  expect(shape.nameColor).toBe('rgb(255, 255, 255)');

  // Centred horizontally to within 8% of the tile.
  expect(
    Math.abs(shape.nameCentreX - shape.tileCentreX) / shape.width
  ).toBeLessThanOrEqual(0.08);

  // The icon sits ABOVE the name, so the pair is centred as a unit and the
  // name's own centre sits one half-icon plus one gap below the tile's centre
  // — a fixed ~28px, or 8-9% of a tile. Anything genuinely off-centre (a name
  // pinned to the bottom, or to one side) is far outside this.
  expect(
    Math.abs(shape.nameCentreY - shape.tileCentreY) / shape.height
  ).toBeLessThanOrEqual(0.1);

  // The overlay covers the whole tile: same box, to within a pixel.
  if (shape.overlay) {
    expect(Math.abs(shape.overlay.height - shape.height)).toBeLessThanOrEqual(
      1
    );
    expect(Math.abs(shape.overlay.width - shape.width)).toBeLessThanOrEqual(1);
  } else {
    // A tile with no photo has no scrim — it uses a solid field instead.
    expect(shape.hasPhoto).toBe(false);
  }
}

test.describe('category tiles: full-bleed photo, dark overlay, centred white name', () => {
  for (const locale of ['en', 'ar'] as const) {
    for (const width of [390, 1280] as const) {
      test(`${locale} at ${width}px: square tile, photo complete, name centred in white`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${WEB_URL}/${locale}/categories`);

        // The heading wording, in this locale.
        await expect(
          page.getByRole('heading', {
            level: 1,
            name: locale === 'en' ? 'Product Categories' : 'أقسام المنتجات',
          })
        ).toBeVisible();
        // The reference has a heading and nothing else above the grid: the
        // subheading sentence that used to sit there is gone from both the home
        // grid and this page.
        await expect(
          page.getByText(
            locale === 'en'
              ? 'Browse our machine families.'
              : 'تصفح عائلات الآلات لدينا.'
          )
        ).toHaveCount(0);

        const tiles = page.locator('main ul li a[href*="/categories/"]');
        expect(await tiles.count()).toBeGreaterThan(1);

        // The fixture tile carries a photo: `contain`, and wholly inside the
        // tile — no cropping, whatever the photo's proportions.
        const withPhoto = page.locator(
          `main ul li a[href="/${locale}/categories/${TILES}"]`
        );
        await expect(withPhoto).toHaveCount(1);
        await expectCompleteImage(withPhoto.locator('img'));

        const inside = await withPhoto.locator('img').evaluate((img) => {
          const tile = img.closest('a')!.getBoundingClientRect();
          const box = img.getBoundingClientRect();
          return {
            insideTop: box.top >= tile.top - 0.5,
            insideBottom: box.bottom <= tile.bottom + 0.5,
            insideLeft: box.left >= tile.left - 0.5,
            insideRight: box.right <= tile.right + 0.5,
          };
        });
        expect(inside).toEqual({
          insideTop: true,
          insideBottom: true,
          insideLeft: true,
          insideRight: true,
        });

        // Every tile: square, scrimmed, white centred name, name is the only
        // text, and the icon is the only graphic.
        for (const tile of await tiles.all()) {
          const name = await tile.getAttribute('aria-label');
          expect(name).toBeTruthy();
          await expect(tile.locator('h3')).toBeVisible();
          await expect(tile.locator('h3')).toHaveText(name!);
          // No count, no arrow: the only icon is the gear.
          expect(await tile.locator('svg').count()).toBe(1);
          expect(((await tile.textContent()) ?? '').trim()).toBe(name);
          await expectSquareTileWithCenteredName(tile);
        }

        // A tile with no photo: the same square, the icon and the name over a
        // solid dark field, and no <img> at all.
        const withoutPhoto = page.locator(
          `main ul li a[href="/${locale}/categories/production-lines"]`
        );
        await expect(withoutPhoto).toHaveCount(1);
        await expect(withoutPhoto.locator('img')).toHaveCount(0);
        await expect(withoutPhoto.locator('svg')).toHaveCount(1);
        const field = await withoutPhoto.evaluate((el) => {
          const dark = Array.from(el.querySelectorAll('div')).find((child) => {
            const bg = getComputedStyle(child).backgroundColor;
            const match = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
            if (!match) return false;
            return (
              Number(match[1]) < 60 &&
              Number(match[2]) < 60 &&
              Number(match[3]) < 60
            );
          });
          return {
            present: Boolean(dark),
            background: dark ? getComputedStyle(dark).backgroundColor : '',
          };
        });
        expect(field.present).toBe(true);
        // Opaque, not a scrim over nothing.
        expect(field.background).toMatch(/^rgb\(/);

        // No sideways overflow, and the row lines up.
        const widths = await page.evaluate(() => ({
          scroll: document.scrollingElement!.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);

        await expectEqualHeightsInRows(tiles);
      });
    }
  }
});

test.describe('machine cards show the complete photo and line up in a row', () => {
  for (const locale of ['en', 'ar'] as const) {
    for (const width of [390, 1280] as const) {
      test(`${locale} at ${width}px: photo complete, equal heights, footer pinned`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${WEB_URL}/${locale}/categories/${TILES}`);

        const cards = page.locator(`main ul li a[href*="/machines/${TAG}"]`);
        await expect(cards).toHaveCount(2);

        for (const card of await cards.all()) {
          await expectCompleteImage(card.locator('img'));
          // The category label sits above the machine's own name.
          await expect(card.locator('p').first()).toHaveText(
            locale === 'en' ? TILES_NAME_EN : TILES_NAME_AR
          );
          // The pinned footer is present on every card.
          await expect(
            card.getByText(locale === 'en' ? 'View details' : 'عرض التفاصيل')
          ).toBeVisible();
        }

        await expectEqualHeightsInRows(cards);
      });
    }
  }

  test('the same card markup is used by the featured strip, the listing and related machines', async ({
    page,
  }) => {
    // One card, four places. If any of them ever grows its own variant this
    // stops matching, which is the whole point of there being a single card.
    const countCards = async (url: string, hrefFragment: string) => {
      await page.goto(url);
      const cards = page.locator(`main ul li a[href*="${hrefFragment}"]`);
      const found = await cards.count();
      expect(found).toBeGreaterThan(0);
      for (const card of await cards.all()) {
        // Every card has the same 4/3 image area (whether or not a photo is
        // loaded into it) and the same pinned footer.
        await expect(card.locator('div.aspect-\\[4\\/3\\]')).toHaveCount(1);
        await expect(
          card.getByText('View details', { exact: false })
        ).toBeVisible();
      }
    };

    await countCards(`${WEB_URL}/en/machines`, '/machines/');
    await countCards(`${WEB_URL}/en/categories/production-lines`, '/machines/');
    await countCards(`${WEB_URL}/en/machines/colina-pro-1000`, '/machines/');
  });
});

test.describe('machines listing category filter', () => {
  for (const locale of ['en', 'ar'] as const) {
    for (const width of [390, 1280] as const) {
      test(`${locale} at ${width}px: chips filter the grid, the active one is marked, an unknown slug falls back to All`, async ({
        page,
      }) => {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`${WEB_URL}/${locale}/machines`);

        const filters = page.getByRole('navigation', {
          name: locale === 'en' ? 'Filter by category' : 'تصفية حسب الفئة',
        });
        await expect(filters).toBeVisible();

        // "All" plus one chip per category, labelled by NAME not by slug — and
        // the fixture chip is named in whichever language is being rendered, so
        // the lookup below resolves to exactly one link in both locales.
        const fixtureChipName = locale === 'en' ? TILES_NAME_EN : TILES_NAME_AR;
        const allChipName = locale === 'en' ? 'All' : 'الكل';

        const chips = filters.getByRole('link');
        await expect(chips.first()).toHaveText(allChipName);
        expect(await chips.count()).toBeGreaterThan(2);
        await expect(
          filters.getByRole('link', { name: fixtureChipName })
        ).toHaveCount(1);

        // Unfiltered: "All" is the current page and nothing else is.
        await expect(filters.locator('[aria-current="page"]')).toHaveCount(1);
        await expect(filters.locator('[aria-current="page"]')).toHaveText(
          allChipName
        );

        const allCount = await page
          .locator('main ul li a[href*="/machines/"]')
          .count();
        expect(allCount).toBeGreaterThan(2);

        // Chips are plain links: the whole filter is in the href.
        const chipHref = await filters
          .getByRole('link', { name: fixtureChipName })
          .getAttribute('href');
        expect(chipHref).toBe(`/${locale}/machines?category=${TILES}`);

        // Follow the fixture chip: only that category's machines survive.
        await page.goto(`${WEB_URL}${chipHref}`);
        await expect(filters.locator('[aria-current="page"]')).toHaveText(
          fixtureChipName
        );
        const filtered = page.locator('main ul li a[href*="/machines/"]');
        await expect(filtered).toHaveCount(2);
        const names = await filtered.evaluateAll((as) =>
          as.map((a) => a.getAttribute('aria-label') ?? '')
        );
        expect(names.sort()).toEqual(
          locale === 'en'
            ? [MACHINE_A_EN, MACHINE_B_EN].sort()
            : [`خط ألفا ${STAMP}`, `خط بيتا ${STAMP}`].sort()
        );

        // An unknown slug is not an error page and not an empty grid: it
        // behaves like "All".
        await page.goto(
          `${WEB_URL}/${locale}/machines?category=no-such-category`
        );
        await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
        await expect(filters.locator('[aria-current="page"]')).toHaveText(
          allChipName
        );
        expect(
          await page.locator('main ul li a[href*="/machines/"]').count()
        ).toBe(allCount);

        // The chip row scrolls on its own and never widens the page.
        const widths = await page.evaluate(() => ({
          scroll: document.scrollingElement!.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
      });
    }
  }
});

test.describe('related machines', () => {
  test('a machine alone in its category gets no related section', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en${LONE_MACHINE}`);
    // Not an empty strip: the section is not rendered at all.
    await expect(page.locator('#related-heading')).toHaveCount(0);
  });

  test('a machine with siblings lists them and never itself', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    const heading = page.locator('#related-heading');
    await expect(heading).toBeVisible();

    const links = page.locator(
      '#related-heading ~ ul li a, section[aria-labelledby="related-heading"] li a'
    );
    const hrefs = await links.evaluateAll((as) =>
      as.map((a) => a.getAttribute('href') ?? '')
    );
    expect(hrefs.length).toBeGreaterThan(0);
    // Cap of four.
    expect(hrefs.length).toBeLessThanOrEqual(4);
    // No self-reference.
    expect(hrefs).not.toContain('/en/machines/colina-pro-1000');
  });

  test('the related strip is identical on both locales', async ({ page }) => {
    const hrefs: string[] = [];
    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${WEB_URL}/${locale}/machines/colina-pro-1000`);
      const list = page.locator(
        'section[aria-labelledby="related-heading"] li a'
      );
      hrefs.push(
        (
          await list.evaluateAll((as) =>
            as.map((a) => a.getAttribute('href') ?? '')
          )
        )
          .map((h) => h.replace(/^\/(en|ar)\//, '/'))
          .join(',')
      );
    }
    expect(hrefs[0]).toBe(hrefs[1]);
  });
});

test.describe('machine quote panel', () => {
  test('is present beside the machine, states which machine, and stacks below the gallery on mobile', async ({
    browser,
  }) => {
    for (const locale of ['en', 'ar'] as const) {
      const context = await browser.newContext({
        viewport: { width: 1280, height: 900 },
      });
      const page = await context.newPage();
      await page.goto(`${WEB_URL}/${locale}/machines/colina-pro-1000`);

      const panel = page.locator('#quote-heading');
      await expect(panel).toBeVisible();
      // The machine is named, so the visitor never has to type a model. The
      // slug is the same in both locales, so it is what proves the reference
      // was built from the row rather than pasted from the URL.
      await expect(
        page.getByText('(colina-pro-1000)', { exact: false })
      ).toBeVisible();
      await context.close();
    }

    // Mobile: the panel comes after the gallery, before the description.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    const order = await page.evaluate(() => {
      const top = (sel: string) => {
        const el = document.querySelector(sel);
        return el ? el.getBoundingClientRect().top : Number.POSITIVE_INFINITY;
      };
      return {
        panel: top('#quote-heading'),
        description: top('#description-heading'),
      };
    });
    expect(order.panel).toBeLessThan(order.description);
    await context.close();
  });

  test('invalid input is rejected client-side and never POSTs', async ({
    page,
  }) => {
    let posted = false;
    page.on('request', (r) => {
      if (
        r.url().endsWith('/api/maintenance-request') &&
        r.method() === 'POST'
      ) {
        posted = true;
      }
    });
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    await page.getByLabel('Phone', { exact: false }).fill('123');
    await page.getByRole('button', { name: 'Send quote request' }).click();
    await expect(
      page.getByText('Please enter a valid phone number.')
    ).toBeVisible();
    expect(posted).toBe(false);
  });

  // The endpoint is rate limited (5 per 10 minutes per IP, shared with the
  // public maintenance form), so the suite deliberately spends only one
  // submission here and checks it end to end.
  test('a valid submission reaches the backend and shows up as a lead', async ({
    browser,
  }) => {
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);

    // Unique so the assertion finds this submission and not an earlier one.
    const stamp = `Quote E2E ${Date.now().toString(36)}`;
    await page.getByLabel('Name', { exact: true }).fill(stamp);
    // Company left blank on purpose: the admin's lead summary falls back to
    // the machine reference, which is what this test needs to observe.
    await page.getByLabel('Phone', { exact: false }).fill('+201001234567');
    await page
      .getByLabel('Message', { exact: false })
      .fill('We need a quote for a 1000 unit per hour line.');
    await page.getByRole('button', { name: 'Send quote request' }).click();

    await expect(
      page.getByText('Thank you — your quote request was received.')
    ).toBeVisible();
    await context.close();

    // ...and it is in the admin's inbox, carrying which machine it is about.
    // The leads list is a card list, not a table.
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const admin = await browser.newContext({ storageState: state });
    const adminPage = await admin.newPage();
    await adminPage.goto(`${ADMIN_URL}/en/leads`);
    const card = adminPage.locator('main li').filter({ hasText: stamp });
    await expect(card).toBeVisible();
    // `company` was left blank, so the card's summary falls back to the
    // machine reference — exactly what an admin triaging the inbox needs.
    await expect(card).toContainText('(colina-pro-1000)');
    await admin.close();
  });

  test('the honeypot is still wired into the quote form', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/machines/colina-pro-1000`);
    // Present, but out of the tab order and inside an aria-hidden wrapper,
    // exactly as on the maintenance form: reused endpoint, reused trap.
    const trap = page.locator('input[name="website"]');
    await expect(trap).toHaveCount(1);
    await expect(trap).toHaveAttribute('tabindex', '-1');
    await expect(trap).toHaveAttribute('autocomplete', 'off');
    await expect(
      trap.locator('xpath=ancestor::div[@aria-hidden="true"]')
    ).toHaveCount(1);
  });
});

// Moved here from category-hero.spec.ts: this is about the machine page, not
// about the category hero, and it drives the real admin form.
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
