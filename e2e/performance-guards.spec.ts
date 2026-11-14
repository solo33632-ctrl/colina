import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { test, expect, type Browser, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  createMaintenanceCategory,
  createShowcase,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Stage 28d performance guards.
//
// These are not timing assertions. A CI machine's LCP moves with its own load,
// so pinning milliseconds would produce a flaky spec that says nothing about
// the site. What the stage actually changed is structural, and each test below
// pins one of those structures:
//
//   * fonts: each locale requests only its own faces, nothing is preloaded,
//     and every generated face still swaps;
//   * images: the one LCP image is eager + high priority, everything else is
//     lazy + async-decoded, on all three image-led page shapes;
//   * caching: hashed assets and public images keep their policies, and a
//     Cloudinary page warms one connection while a page without Cloudinary
//     warms none.
//
// Fixtures go straight to the database and are removed in `afterAll`, like the
// other public-site specs. `photoOf()` data URIs keep the image assertions
// independent of the network.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-guards-category-${STAMP}`;
const MACHINE = `${TAG}-guards-machine-${STAMP}`;
const CLOUDINARY_MACHINE = `${TAG}-guards-cloudinary-${STAMP}`;
const LINE = `${TAG}-guards-line-${STAMP}`;
const FIRST_SHOWCASE = `${TAG} Guards First ${STAMP}`;
const SECOND_SHOWCASE = `${TAG} Guards Second ${STAMP}`;

const CATEGORY_PHOTO = photoOf(1200, 800);
const GALLERY_PHOTOS = [
  photoOf(400, 900),
  photoOf(1600, 500),
  photoOf(600, 600),
];

// A real Cloudinary-shaped URL. The test intercepts the host and serves a tiny
// inline image, so nothing leaves the machine; only the rendered hint matters.
const CLOUDINARY_URL = `https://res.cloudinary.com/demo-cloud/image/upload/v1712345678/colina/${TAG}-guards-${STAMP}.jpg`;
const STUB_IMAGE = [
  '<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800">',
  '<rect width="1200" height="800" fill="#EB693F"/>',
  '</svg>',
].join('');

let firstShowcaseId: string;

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Guards Category ${STAMP}`,
    nameAr: `فئة حراسة الأداء ${STAMP}`,
    descriptionEn: 'A category created only for the performance guards.',
    descriptionAr: 'فئة أنشئت فقط لاختبارات حماية الأداء.',
    image: CATEGORY_PHOTO,
  });
  createMachine({
    slug: MACHINE,
    nameEn: `Guards Machine ${STAMP}`,
    nameAr: `آلة حراسة الأداء ${STAMP}`,
    shortDescriptionEn: 'Three photos, all below the fold except the hero.',
    shortDescriptionAr: 'ثلاث صور، جميعها أسفل الطية عدا الصورة الرئيسية.',
    categorySlug: CATEGORY,
    images: GALLERY_PHOTOS.map((url, position) => ({ url, position })),
  });
  createMachine({
    slug: CLOUDINARY_MACHINE,
    nameEn: `Guards Cloudinary ${STAMP}`,
    nameAr: `آلة كلاوديناري ${STAMP}`,
    shortDescriptionEn: 'A fixture whose photo is eligible for Cloudinary delivery.',
    shortDescriptionAr: 'آلة تجريبية صورتها مؤهلة للتسليم عبر كلاوديناري.',
    categorySlug: CATEGORY,
    images: [{ url: CLOUDINARY_URL, position: 0 }],
  });
  createMaintenanceCategory({
    slug: LINE,
    nameEn: `Guards Line ${STAMP}`,
    nameAr: `خط حراسة الأداء ${STAMP}`,
    descriptionEn: 'A line created only for the performance guards.',
    descriptionAr: 'خط أنشئ فقط لاختبارات حماية الأداء.',
  });
  firstShowcaseId = createShowcase({
    nameEn: FIRST_SHOWCASE,
    nameAr: `${FIRST_SHOWCASE} أ`,
    categorySlug: LINE,
  });
  createShowcase({
    nameEn: SECOND_SHOWCASE,
    nameAr: `${SECOND_SHOWCASE} ب`,
    categorySlug: LINE,
  });
});

test.afterAll(() => {
  cleanupFixtures();
});

type FontReport = {
  urls: string[];
  preloads: number;
  displays: string[];
};

async function fontReport(browser: Browser, locale: 'en' | 'ar') {
  // The measurement viewport, and the one where the rule is exact: below the
  // `sm` breakpoint the language switcher is hidden, so the page contains only
  // its own locale's text. At desktop width the switcher legitimately renders
  // the OTHER language's name in the other family, which is used text, not an
  // unused preload — counting that against the locale rule would be wrong.
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  const page = await context.newPage();
  const urls = new Set<string>();
  page.on('response', (response) => {
    if (response.request().resourceType() === 'font') {
      urls.add(response.url());
    }
  });

  await page.goto(`${WEB_URL}/${locale}`);
  // Resolves once every face the rendered text needs has finished loading.
  await page.evaluate(() => document.fonts.ready);

  const preloads = await page
    .locator('link[rel="preload"][as="font"]')
    .count();
  // Every generated face must still be `swap`, or a slow font hides the text.
  const displays = await page.evaluate(() => {
    const values: string[] = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules: CSSRuleList;
      try {
        rules = sheet.cssRules;
      } catch {
        // A cross-origin stylesheet we cannot read; no font faces live there.
        continue;
      }
      for (const rule of Array.from(rules)) {
        if (!(rule instanceof CSSFontFaceRule)) continue;
        // next/font also emits metric-matched fallback faces that point at a
        // LOCAL font (`src: local("Arial")`). Those carry no font-display and
        // load no webfont, so they are not what this guard is about. Every
        // face that downloads a file must still say `swap`.
        const src = rule.style.getPropertyValue('src');
        if (src.includes('url(')) {
          values.push(rule.style.getPropertyValue('font-display'));
        }
      }
    }
    return values;
  });

  await context.close();
  return { urls: [...urls], preloads, displays } satisfies FontReport;
}

const sliderImages = (page: Page, index = 0) =>
  page
    .locator('main ul [data-testid="before-after-slider"]')
    .nth(index)
    .locator('img');

/**
 * Every content photo on the page must decode off the main thread, and only
 * the LCP image(s) may be eager/high. `eager` states how many protected photos
 * this page is allowed to promote (0 on home, whose LCP is the text hero, 1 on
 * a category or machine page, 2 for a before/after comparison).
 */
async function expectContentImages(page: Page, eager: number) {
  const images = page.locator('main img[data-protected-image]');
  const count = await images.count();
  expect(count).toBeGreaterThan(0);

  let eagerCount = 0;
  for (let index = 0; index < count; index += 1) {
    const image = images.nth(index);
    await expect(image).toHaveAttribute('decoding', 'async');
    const loading = await image.getAttribute('loading');
    if (loading === 'eager') {
      eagerCount += 1;
      await expect(image).toHaveAttribute('fetchpriority', 'high');
    } else {
      await expect(image).toHaveAttribute('loading', 'lazy');
      expect(await image.getAttribute('fetchpriority')).toBeNull();
    }
  }

  expect(eagerCount).toBe(eager);
}

/**
 * A photo must sit in a box whose height is known before the image decodes.
 * That is either an explicit width/height pair (none of the content photos
 * carry one) or a CSS aspect-ratio/min-height box on the image or one of its
 * near ancestors. A computed pixel height is not evidence: every laid-out
 * element has one. The category hero reserves its band with `min-height`
 * rather than a ratio, which is why that case is included.
 */
async function expectReservedBoxes(page: Page) {
  const missing = await page.evaluate(() => {
    const images = Array.from(
      document.querySelectorAll<HTMLImageElement>(
        'main img[data-protected-image]'
      )
    );

    return images
      .filter((image) => {
        const width = Number(image.getAttribute('width'));
        const height = Number(image.getAttribute('height'));
        if (width > 0 && height > 0) return false;

        let node: Element | null = image;
        for (let depth = 0; node && depth < 5; depth += 1) {
          const style = getComputedStyle(node);
          if (style.aspectRatio && style.aspectRatio !== 'auto') {
            return false;
          }
          if (style.minHeight !== 'auto' && style.minHeight !== '0px') {
            return false;
          }
          node = node.parentElement;
        }
        return true;
      })
      .map((image) => image.outerHTML.slice(0, 160));
  });

  expect(missing).toEqual([]);
}

test('fonts: at phone width each locale loads only its own files, and none are preloaded', async ({
  browser,
}) => {
  const [english, arabic] = await Promise.all([
    fontReport(browser, 'en'),
    fontReport(browser, 'ar'),
  ]);

  // Both locales render text in their own face; an empty set would make the
  // disjointness assertion below vacuously true.
  expect(english.urls.length).toBeGreaterThan(0);
  expect(arabic.urls.length).toBeGreaterThan(0);

  // The fix's whole point: an English page no longer downloads the Arabic
  // files and an Arabic page no longer downloads the Latin variable file.
  expect(english.urls.filter((url) => arabic.urls.includes(url))).toEqual([]);

  // Locale-specific preloading is impossible from a shared layout, so the
  // only honest policy is none at all; the browser fetches what it uses.
  expect(english.preloads).toBe(0);
  expect(arabic.preloads).toBe(0);

  for (const report of [english, arabic]) {
    expect(report.displays.length).toBeGreaterThan(0);
    expect(report.displays.every((value) => value === 'swap')).toBe(true);
  }
});

test('images: home content photos are all lazy and async, because its LCP is text', async ({
  page,
}) => {
  await page.goto(`${WEB_URL}/en`);

  // The header logo is page chrome and keeps its own priority; the photos in
  // the page body are below the text hero and must not compete with it.
  await expectContentImages(page, 0);
  await expectReservedBoxes(page);
});

test('images: the category hero is eager and high priority; cards stay lazy', async ({
  page,
}) => {
  // This category also contains the Cloudinary machine used by the preconnect
  // guard. Its URL is deliberately synthetic, so serve it locally: otherwise
  // the failed request replaces that card's photo with a fallback tile and the
  // number of images on the page changes while the loop below is reading them.
  // The rule under test is the loading attributes, not reachability of a demo
  // host.
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: STUB_IMAGE,
    })
  );
  await page.goto(`${WEB_URL}/en/categories/${CATEGORY}`);

  const hero = page.locator('#category-hero-photo');
  await expect(hero).toHaveAttribute('loading', 'eager');
  await expect(hero).toHaveAttribute('fetchpriority', 'high');
  await expect(hero).toHaveAttribute('decoding', 'async');

  // Exactly the hero is promoted; every machine card below it stays lazy.
  await expectContentImages(page, 1);
  await expectReservedBoxes(page);
});

test('images: the gallery hero is eager and high priority; thumbnails stay lazy', async ({
  page,
}) => {
  await page.goto(`${WEB_URL}/en/machines/${MACHINE}`);
  const gallery = page.locator('section[aria-labelledby="gallery-heading"]');

  const hero = gallery.locator('img[alt]:not([alt=""])').first();
  await expect(hero).toHaveAttribute('loading', 'eager');
  await expect(hero).toHaveAttribute('fetchpriority', 'high');
  await expect(hero).toHaveAttribute('decoding', 'async');

  const thumbnails = gallery.locator('ul img');
  await expect(thumbnails).toHaveCount(GALLERY_PHOTOS.length);
  for (let index = 0; index < GALLERY_PHOTOS.length; index += 1) {
    const thumbnail = thumbnails.nth(index);
    await expect(thumbnail).toHaveAttribute('loading', 'lazy');
    await expect(thumbnail).toHaveAttribute('decoding', 'async');
    expect(await thumbnail.getAttribute('fetchpriority')).toBeNull();
  }

  // Related cards lower down are lazy too; only the hero is promoted.
  await expectContentImages(page, 1);
  await expectReservedBoxes(page);
});

test('images: the first maintenance comparison is eager; later ones stay lazy', async ({
  page,
}) => {
  await page.goto(`${WEB_URL}/en/maintenance/${LINE}`);

  // The first card carries the line page's LCP image — both layers of the
  // comparison, because either one can be the painted photograph.
  const featured = sliderImages(page, 0);
  await expect(featured).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const image = featured.nth(index);
    await expect(image).toHaveAttribute('loading', 'eager');
    await expect(image).toHaveAttribute('fetchpriority', 'high');
    await expect(image).toHaveAttribute('decoding', 'async');
  }

  // A second card exists so "only the first" is a real claim.
  const later = sliderImages(page, 1);
  await expect(later).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const image = later.nth(index);
    await expect(image).toHaveAttribute('loading', 'lazy');
    await expect(image).toHaveAttribute('decoding', 'async');
    expect(await image.getAttribute('fetchpriority')).toBeNull();
  }

  await expectContentImages(page, 2);
  await expectReservedBoxes(page);

  // The detail page promotes its own comparison, and the related strip below
  // it keeps the generic lazy treatment.
  await page.goto(`${WEB_URL}/en/maintenance/${LINE}/${firstShowcaseId}`);
  const detail = page
    .locator('main [data-testid="before-after-slider"]')
    .first()
    .locator('img');
  await expect(detail).toHaveCount(2);
  for (let index = 0; index < 2; index += 1) {
    const image = detail.nth(index);
    await expect(image).toHaveAttribute('loading', 'eager');
    await expect(image).toHaveAttribute('fetchpriority', 'high');
    await expect(image).toHaveAttribute('decoding', 'async');
  }

  const related = page
    .locator('main [data-testid="before-after-slider"]')
    .nth(1)
    .locator('img');
  await expect(related.first()).toHaveAttribute('loading', 'lazy');

  await expectContentImages(page, 2);
  await expectReservedBoxes(page);
});

test('javascript: a page with no gallery never fetches the lightbox code', async ({
  page,
}) => {
  // The lightbox is the only place `showModal()` is called, so finding that
  // string in an initial script means the dialog module was bundled into a
  // route chunk. Reading the served bodies keeps the guard independent of
  // hashed filenames and of dev-server chunk naming.
  const bodies: Promise<string>[] = [];
  page.on('response', (response) => {
    if (response.request().resourceType() === 'script') {
      bodies.push(response.text().catch(() => ''));
    }
  });

  await page.goto(`${WEB_URL}/en`);
  // `load` is the point by which the route's initial module graph has been
  // requested. A static import of the lightbox would be in that graph; the
  // dynamic one is only fetched when the opener is clicked on a gallery page.
  // Waiting for `networkidle` here is both unnecessary and slow in dev.
  const scripts = await Promise.all(bodies);
  expect(scripts.length).toBeGreaterThan(0);
  expect(scripts.filter((body) => body.includes('showModal('))).toEqual([]);
});

test('caching: a Cloudinary photo adds one preconnect; a page without one adds none', async ({
  page,
}) => {
  await page.route('https://res.cloudinary.com/**', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: STUB_IMAGE,
    })
  );

  await page.goto(`${WEB_URL}/en/machines/${CLOUDINARY_MACHINE}`);
  const hints = page.locator(
    'head link[rel="preconnect"][href="https://res.cloudinary.com"]'
  );
  // One hint, not one per card: React deduplicates the repeated calls.
  await expect(hints).toHaveCount(1);

  // A page that shows no Cloudinary photo must not warm the connection.
  await page.goto(`${WEB_URL}/en`);
  await expect(
    page.locator(
      'head link[rel="preconnect"][href="https://res.cloudinary.com"]'
    )
  ).toHaveCount(0);
});

test('caching: hashed assets and public images keep their policies', async () => {
  // The config is the source of truth for `next start` and for dev. It reads
  // NODE_ENV when it builds the CSP, so load it in a production child rather
  // than inheriting the test runner's environment: otherwise the assertion
  // would inspect the development branch (which intentionally allows eval)
  // and prove nothing about what production serves.
  const configPath = resolve(__dirname, '../apps/web/next.config.mjs');
  const marker = '__STAGE_28D_CONFIG__';
  const output = execFileSync(
    process.execPath,
    [
      '-e',
      [
        `const config = require(${JSON.stringify(configPath)}).default;`,
        'Promise.resolve(config.headers())',
        `  .then((rules) => process.stdout.write(${JSON.stringify(marker)} + JSON.stringify(rules)))`,
        '  .catch((error) => { console.error(error); process.exit(1); });',
      ].join('\n'),
    ],
    {
      cwd: resolve(__dirname, '..'),
      env: { ...process.env, NODE_ENV: 'production' },
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }
  );
  const start = output.lastIndexOf(marker);
  expect(start).toBeGreaterThanOrEqual(0);
  const rules: {
    source: string;
    headers: { key: string; value: string }[];
  }[] = JSON.parse(output.slice(start + marker.length));

  const publicImages = rules.find(
    (rule) => rule.source === '/:path*.(png|jpg|jpeg|gif|webp|avif|svg|ico)'
  );
  expect(publicImages).toBeDefined();
  expect(publicImages!.headers).toContainEqual({
    key: 'Cache-Control',
    value: 'public, max-age=86400, stale-while-revalidate=604800',
  });

  const hashedAssets = rules.find(
    (rule) => rule.source === '/_next/static/:path*'
  );
  expect(hashedAssets).toBeDefined();
  expect(hashedAssets!.headers).toContainEqual({
    key: 'Cache-Control',
    value: 'public, max-age=31536000, immutable',
  });

  // A later matching rule wins, so the image rule must be listed first or an
  // image-shaped `/_next/static` file would lose its one-year immutability.
  expect(rules.indexOf(publicImages!)).toBeLessThan(
    rules.indexOf(hashedAssets!)
  );

  // The security headers stay on every page, and production still refuses
  // both inline-eval script sources and foreign frame sources.
  const pages = rules.find((rule) => rule.source === '/:path*');
  expect(pages).toBeDefined();
  const csp = pages!.headers.find(
    (header) => header.key === 'Content-Security-Policy'
  )?.value;
  expect(csp).toBeDefined();
  expect(csp).toContain("default-src 'self'");
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).not.toContain("'unsafe-eval'");
});
