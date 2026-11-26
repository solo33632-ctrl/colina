import { test, expect, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  DATABASE_URL,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3001';
const BASE = WEB_URL.replace(/\/+$/, '');

const TAG = 'st-seo';
const STAMP = Date.now().toString(36);

const CATEGORY_SLUG = `${TAG}-category-${STAMP}`;
const CATEGORY_NAME = {
  en: `SEO Category ${STAMP}`,
  ar: `فئة SEO ${STAMP}`,
};
const CATEGORY_DESCRIPTION = {
  en: 'A category created only for the SEO test.',
  ar: 'فئة أُنشئت لاختبار تحسين محركات البحث فقط.',
};

const MACHINE_SLUG = `${TAG}-machine-${STAMP}`;
const MACHINE_NAME = {
  en: `SEO Machine ${STAMP}`,
  ar: `آلة SEO ${STAMP}`,
};
const MACHINE_DESCRIPTION = {
  en: 'A machine created only for the SEO test.',
  ar: 'آلة أُنشئت لاختبار تحسين محركات البحث فقط.',
};

const DRAFT_MACHINE_SLUG = `${TAG}-draft-${STAMP}`;
const DRAFT_MACHINE_NAME = {
  en: `Draft SEO Machine ${STAMP}`,
  ar: `آلة SEO مسودة ${STAMP}`,
};

// A real https media URL: the metadata path deliberately refuses http and
// data: photos, so this is what proves a stored machine photo becomes the
// share image rather than silently falling back to the default card.
const PHOTO =
  'https://res.cloudinary.com/demo-cloud/image/upload/v1/seo-fixture.jpg';

type JsonLdNode = Record<string, unknown>;

async function jsonLd(page: Page): Promise<JsonLdNode[]> {
  return page
    .locator('script[type="application/ld+json"]')
    .evaluateAll((scripts) =>
      scripts.map(
        (script) => JSON.parse(script.textContent ?? '{}') as JsonLdNode
      )
    );
}

function meta(page: Page, selector: string) {
  return page.locator(selector).first().getAttribute('content');
}

function typesOf(nodes: JsonLdNode[]) {
  return nodes.map((node) => node['@type']);
}

test.skip(!DATABASE_URL, 'DATABASE_URL is required for SEO fixtures');

test.beforeAll(() => {
  if (!DATABASE_URL) return;
  createCategory({
    slug: CATEGORY_SLUG,
    nameEn: CATEGORY_NAME.en,
    nameAr: CATEGORY_NAME.ar,
    descriptionEn: CATEGORY_DESCRIPTION.en,
    descriptionAr: CATEGORY_DESCRIPTION.ar,
    image: PHOTO,
  });
  createMachine({
    slug: MACHINE_SLUG,
    nameEn: MACHINE_NAME.en,
    nameAr: MACHINE_NAME.ar,
    shortDescriptionEn: MACHINE_DESCRIPTION.en,
    shortDescriptionAr: MACHINE_DESCRIPTION.ar,
    categorySlug: CATEGORY_SLUG,
    imageUrl: PHOTO,
  });
  createMachine({
    slug: DRAFT_MACHINE_SLUG,
    nameEn: DRAFT_MACHINE_NAME.en,
    nameAr: DRAFT_MACHINE_NAME.ar,
    shortDescriptionEn: 'A draft machine that must stay out of the index.',
    shortDescriptionAr: 'آلة مسودة يجب ألا تظهر في الفهرس.',
    categorySlug: CATEGORY_SLUG,
    isPublished: false,
  });
});

test.afterAll(() => {
  if (!DATABASE_URL) return;
  cleanupFixtures(TAG);
});

for (const locale of ['ar', 'en'] as const) {
  test(`home emits title, canonical, hreflang and Organization/WebSite JSON-LD (${locale})`, async ({
    page,
  }) => {
    await page.goto(`${BASE}/${locale}`);

    await expect(page).toHaveTitle(
      locale === 'ar'
        ? 'خطوط إنتاج الأغذية، مصممة لتدوم'
        : 'Food production lines, built to last'
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${BASE}/${locale}`
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="ar"]')
    ).toHaveAttribute('href', `${BASE}/ar`);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]')
    ).toHaveAttribute('href', `${BASE}/en`);
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]')
    ).toHaveAttribute('href', `${BASE}/ar`);
    expect(await meta(page, 'meta[property="og:type"]')).toBe('website');
    expect(await meta(page, 'meta[property="og:locale"]')).toBe(
      locale === 'ar' ? 'ar_AR' : 'en_US'
    );
    expect(await meta(page, 'meta[name="twitter:card"]')).toBe(
      'summary_large_image'
    );

    const nodes = await jsonLd(page);
    expect(typesOf(nodes)).toEqual(
      expect.arrayContaining(['Organization', 'WebSite'])
    );
    const organization = nodes.find((node) => node['@type'] === 'Organization');
    expect(organization).toMatchObject({
      name: locale === 'ar' ? 'كولينا' : 'Colina',
      url: BASE,
      logo: `${BASE}/logo.png`,
    });
  });

  test(`category page emits localized metadata and BreadcrumbList (${locale})`, async ({
    page,
  }) => {
    const canonical = `${BASE}/${locale}/categories/${CATEGORY_SLUG}`;
    await page.goto(canonical);

    await expect(page).toHaveTitle(CATEGORY_NAME[locale]);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="ar"]')
    ).toHaveAttribute('href', `${BASE}/ar/categories/${CATEGORY_SLUG}`);
    await expect(
      page.locator('link[rel="alternate"][hreflang="en"]')
    ).toHaveAttribute('href', `${BASE}/en/categories/${CATEGORY_SLUG}`);
    expect(await meta(page, 'meta[property="og:title"]')).toBe(
      CATEGORY_NAME[locale]
    );
    expect(await meta(page, 'meta[property="og:url"]')).toBe(canonical);
    expect(await meta(page, 'meta[property="og:image"]')).toBe(PHOTO);

    const nodes = await jsonLd(page);
    expect(typesOf(nodes)).toContain('BreadcrumbList');
    const breadcrumb = nodes.find((node) => node['@type'] === 'BreadcrumbList');
    const items = breadcrumb?.itemListElement as
      | { name: string; item: string }[]
      | undefined;
    expect(items?.map((item) => item.name)).toEqual([
      locale === 'ar' ? 'الرئيسية' : 'Home',
      locale === 'ar' ? 'أقسام المنتجات' : 'Product Categories',
      CATEGORY_NAME[locale],
    ]);
    expect(items?.at(-1)?.item).toBe(canonical);
  });

  test(`machine page emits Product without offers and a BreadcrumbList (${locale})`, async ({
    page,
  }) => {
    const canonical = `${BASE}/${locale}/machines/${MACHINE_SLUG}`;
    await page.goto(canonical);

    await expect(page).toHaveTitle(MACHINE_NAME[locale]);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      canonical
    );
    await expect(
      page.locator('link[rel="alternate"][hreflang="x-default"]')
    ).toHaveAttribute('href', `${BASE}/ar/machines/${MACHINE_SLUG}`);
    expect(await meta(page, 'meta[property="og:title"]')).toBe(
      MACHINE_NAME[locale]
    );
    expect(await meta(page, 'meta[property="og:image"]')).toBe(PHOTO);

    const nodes = await jsonLd(page);
    expect(typesOf(nodes)).toEqual(
      expect.arrayContaining(['Product', 'BreadcrumbList'])
    );
    const product = nodes.find((node) => node['@type'] === 'Product');
    expect(product).toMatchObject({
      name: MACHINE_NAME[locale],
      description: MACHINE_DESCRIPTION[locale],
      image: PHOTO,
      category: CATEGORY_NAME[locale],
      url: canonical,
    });
    expect(product).not.toHaveProperty('offers');
    expect(product).not.toHaveProperty('price');
    expect(product).not.toHaveProperty('aggregateRating');
    expect(product).not.toHaveProperty('review');
    expect(product).not.toHaveProperty('availability');
  });
}

test('draft machine is absent from the sitemap and returns 404', async ({
  request,
  page,
}) => {
  const sitemap = await request.get(`${BASE}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();
  expect(xml).toContain(`<loc>${BASE}/en/machines</loc>`);
  expect(xml).not.toContain(DRAFT_MACHINE_SLUG);

  const response = await page.goto(`${BASE}/en/machines/${DRAFT_MACHINE_SLUG}`);
  expect(response?.status()).toBe(404);
  expect(await meta(page, 'meta[name="robots"]')).toContain('noindex');
});

test('filtered catalogue views are noindex and canonical to the clean URL', async ({
  page,
}) => {
  await page.goto(`${BASE}/en/machines?category=${CATEGORY_SLUG}`);

  expect(await meta(page, 'meta[name="robots"]')).toContain('noindex');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
    'href',
    `${BASE}/en/machines`
  );
});

test('admin sends noindex on every response and disallows all robots', async ({
  request,
}) => {
  const login = await request.get(`${ADMIN_URL}/en/login`);
  expect(login.headers()['x-robots-tag']).toBe('noindex, nofollow');

  const robots = await request.get(`${ADMIN_URL}/robots.txt`);
  expect(robots.status()).toBe(200);
  const text = await robots.text();
  expect(text).toMatch(/User-Agent:\s*\*/i);
  expect(text).toMatch(/Disallow:\s*\/\s*$/im);
});
