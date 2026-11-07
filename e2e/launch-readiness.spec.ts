import { test, expect, type Page } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const BASE = WEB_URL.replace(/\/+$/, '');

const NAV = {
  en: {
    main: 'Main navigation',
    links: [
      ['Home', '/'],
      ['Products', '/categories'],
      ['Maintenance', '/maintenance'],
      ['Agents', '/agents'],
      ['About', '/about'],
      ['Contact', '/contact'],
    ],
  },
  ar: {
    main: 'التنقل الرئيسي',
    links: [
      ['الرئيسية', '/'],
      ['أقسام المنتجات', '/categories'],
      ['الصيانة', '/maintenance'],
      ['وكلاؤنا', '/agents'],
      ['من نحن', '/about'],
      ['اتصل بنا', '/contact'],
    ],
  },
} as const;

const FOOTER = {
  en: [
    ['Products', '/categories'],
    ['Maintenance', '/maintenance'],
    ['About', '/about'],
    ['Our partners', '/partners'],
    ['Agents', '/agents'],
    ['Contact', '/contact'],
    ['Privacy Policy', '/privacy'],
  ],
  ar: [
    ['أقسام المنتجات', '/categories'],
    ['الصيانة', '/maintenance'],
    ['من نحن', '/about'],
    ['شركاؤنا', '/partners'],
    ['وكلاؤنا', '/agents'],
    ['اتصل بنا', '/contact'],
    ['سياسة الخصوصية', '/privacy'],
  ],
} as const;

type Locale = keyof typeof NAV;

function linksOf(locale: Locale) {
  return NAV[locale].links.map(([label, href]) => ({
    label,
    href: href === '/' ? `/${locale}` : `/${locale}${href}`,
  }));
}

function footerLinksOf(locale: Locale) {
  return FOOTER[locale].map(([label, href]) => ({
    label,
    href: `/${locale}${href}`,
  }));
}

async function expectOrderedLinks(
  page: Page,
  selector: string,
  expected: { label: string; href: string }[]
) {
  const links = page.locator(selector);
  await expect(links).toHaveCount(expected.length);
  const actual = await links.evaluateAll((elements) =>
    elements.map((element) => ({
      label: element.textContent?.trim() ?? '',
      href: element.getAttribute('href'),
    }))
  );
  expect(actual).toEqual(expected);
}

async function metaContent(page: Page, selector: string) {
  return page.locator(selector).first().getAttribute('content');
}

test.describe('primary navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const locale of ['en', 'ar'] as const) {
    test(`header and footer link order (${locale})`, async ({ page }) => {
      await page.goto(`${BASE}/${locale}`);

      await expect(page.locator('header nav')).toHaveAccessibleName(
        NAV[locale].main
      );
      await expectOrderedLinks(page, 'header nav a', linksOf(locale));
      await expect(page.locator('footer nav')).toHaveAccessibleName(
        locale === 'en' ? 'Quick links' : 'روابط سريعة'
      );
      await expectOrderedLinks(page, 'footer nav a', footerLinksOf(locale));
    });
  }
});

test.describe('mobile menu at 390px', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const locale of ['en', 'ar'] as const) {
    test(`opens, locks scroll, mirrors and closes with Escape (${locale})`, async ({
      page,
    }) => {
      await page.goto(`${BASE}/${locale}`);
      await page.waitForLoadState('networkidle');

      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr'
      );

      const toggle = page.locator('button[aria-controls="mobile-menu"]');
      const openName = locale === 'en' ? 'Open menu' : 'افتح القائمة';
      const closeName = locale === 'en' ? 'Close menu' : 'أغلق القائمة';

      await expect(toggle).toBeVisible();
      await expect(toggle).toHaveAccessibleName(openName);
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(page.locator('#mobile-menu')).toHaveCount(0);

      // The desktop list is hidden below `sm`; the panel is the only way to
      // reach the primary links at this width.
      await expect(page.locator('header nav')).toBeHidden();

      const header = page.locator('header');
      const headerBefore = await header.boundingBox();
      const toggleBox = await toggle.boundingBox();
      expect(headerBefore).not.toBeNull();
      expect(toggleBox).not.toBeNull();

      // Inline-end placement: the toggle sits at the right in LTR and at the
      // left in RTL, so the two locales are mirror images.
      const toggleCenter = toggleBox!.x + toggleBox!.width / 2;
      if (locale === 'en') {
        expect(toggleCenter).toBeGreaterThan(390 / 2);
      } else {
        expect(toggleCenter).toBeLessThan(390 / 2);
      }

      const scrollbarBefore = await page.evaluate(
        () => window.innerWidth - document.documentElement.clientWidth
      );

      await toggle.click();

      const panel = page.locator('#mobile-menu');
      await expect(panel).toBeVisible();
      await expect(toggle).toHaveAttribute('aria-expanded', 'true');
      await expect(toggle).toHaveAccessibleName(closeName);

      // Focus moves into the panel, onto its first link.
      await expect(panel.locator('nav a').first()).toBeFocused();
      await expectOrderedLinks(page, '#mobile-menu nav a', linksOf(locale));
      await expect(
        panel.getByRole('button', {
          name: locale === 'en' ? 'العربية' : 'English',
        })
      ).toBeVisible();

      // Scroll is locked, and the scrollbar width is added back so the page
      // does not shift sideways when it disappears.
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .toBe('hidden');
      if (scrollbarBefore > 0) {
        await expect
          .poll(() => page.evaluate(() => document.body.style.paddingInlineEnd))
          .toBe(`${scrollbarBefore}px`);
      }
      const headerAfter = await header.boundingBox();
      const panelBox = await panel.boundingBox();
      expect(headerAfter).not.toBeNull();
      expect(panelBox).not.toBeNull();
      expect(Math.abs(headerAfter!.width - headerBefore!.width)).toBeLessThan(
        1
      );
      expect(Math.abs(panelBox!.x - headerAfter!.x)).toBeLessThan(1);
      expect(Math.abs(panelBox!.width - headerAfter!.width)).toBeLessThan(1);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.innerWidth);

      // Escape closes the panel and restores focus to the toggle.
      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(toggle).toBeFocused();
      await expect(toggle).toHaveAttribute('aria-expanded', 'false');
      await expect(toggle).toHaveAccessibleName(openName);
      await expect
        .poll(() => page.evaluate(() => document.body.style.overflow))
        .toBe('');
    });
  }

  test('a panel link closes the menu and navigates', async ({ page }) => {
    await page.goto(`${BASE}/en`);
    await page.waitForLoadState('networkidle');

    const toggle = page.locator('button[aria-controls="mobile-menu"]');
    await toggle.click();
    const panel = page.locator('#mobile-menu');
    await expect(panel).toBeVisible();

    await panel.getByRole('link', { name: 'Products', exact: true }).click();
    await expect(page).toHaveURL(`${BASE}/en/categories`);
    await expect(page.locator('#mobile-menu')).toHaveCount(0);
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });
});

test.describe('skip link', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`is the first tab stop and jumps to main (${locale})`, async ({
      page,
    }) => {
      await page.goto(`${BASE}/${locale}`);
      await page.waitForLoadState('networkidle');

      await page.keyboard.press('Tab');
      const skip = page.getByRole('link', {
        name:
          locale === 'en'
            ? 'Skip to main content'
            : 'تخطَّ إلى المحتوى الرئيسي',
      });
      await expect(skip).toBeFocused();
      await expect(skip).toBeVisible();
      const box = await skip.boundingBox();
      expect(box).not.toBeNull();
      expect(box!.width).toBeGreaterThan(0);
      expect(box!.height).toBeGreaterThan(0);

      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(`${BASE}/${locale}#main-content`);
      await expect(page.locator('#main-content')).toBeFocused();
    });
  }
});

test.describe('404 pages', () => {
  const cases = [
    {
      path: '/machines/does-not-exist',
      en: 'Page not found',
      ar: 'الصفحة غير موجودة',
    },
    {
      path: '/categories/does-not-exist',
      en: 'Page not found',
      ar: 'الصفحة غير موجودة',
    },
    {
      path: '/maintenance/does-not-exist/does-not-exist',
      en: 'Page not found',
      ar: 'الصفحة غير موجودة',
    },
    {
      path: '/this-route-does-not-exist',
      en: 'Page not found',
      ar: 'الصفحة غير موجودة',
    },
  ] as const;

  for (const locale of ['en', 'ar'] as const) {
    test(`unknown URLs return real 404s with localized content (${locale})`, async ({
      page,
    }) => {
      for (const entry of cases) {
        const response = await page.goto(`${BASE}/${locale}${entry.path}`);
        expect(response?.status()).toBe(404);

        await expect(
          page.getByRole('heading', { level: 1, name: entry[locale] })
        ).toBeVisible();
        await expect(
          page.locator('meta[name="robots"]').first()
        ).toHaveAttribute('content', /noindex/);

        const links = {
          home: `/${locale}`,
          products: `/${locale}/categories`,
          contact: `/${locale}/contact`,
        };
        for (const [label, href] of [
          [
            locale === 'en' ? 'Back to home' : 'العودة إلى الرئيسية',
            links.home,
          ],
          [
            locale === 'en' ? 'Browse products' : 'تصفح المنتجات',
            links.products,
          ],
          [locale === 'en' ? 'Contact us' : 'تواصل معنا', links.contact],
        ] as const) {
          await expect(
            page.getByRole('link', { name: label, exact: true })
          ).toHaveAttribute('href', href);
        }
      }
    });
  }
});

test.describe('share metadata', () => {
  test('home page (en)', async ({ page }) => {
    await page.goto(`${BASE}/en`);

    expect(await metaContent(page, 'meta[property="og:title"]')).toBe(
      'Food production lines, built to last'
    );
    expect(await metaContent(page, 'meta[property="og:site_name"]')).toBe(
      'Colina'
    );
    expect(await metaContent(page, 'meta[property="og:locale"]')).toBe('en_US');
    expect(
      await metaContent(page, 'meta[property="og:locale:alternate"]')
    ).toBe('ar_AR');
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe('website');
    expect(await metaContent(page, 'meta[property="og:image"]')).toBe(
      `${BASE}/og-default.png`
    );
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe(
      '1200'
    );
    expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe(
      '630'
    );
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe(
      'summary_large_image'
    );
    expect(await metaContent(page, 'meta[name="twitter:title"]')).toBe(
      'Food production lines, built to last'
    );
    expect(await metaContent(page, 'meta[name="twitter:image"]')).toBe(
      `${BASE}/og-default.png`
    );

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${BASE}/en`
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
  });

  test('home page (ar)', async ({ page }) => {
    await page.goto(`${BASE}/ar`);

    expect(await metaContent(page, 'meta[property="og:title"]')).toBe(
      'خطوط إنتاج الأغذية، مصممة لتدوم'
    );
    expect(await metaContent(page, 'meta[property="og:site_name"]')).toBe(
      'كولينا'
    );
    expect(await metaContent(page, 'meta[property="og:locale"]')).toBe('ar_AR');
    expect(
      await metaContent(page, 'meta[property="og:locale:alternate"]')
    ).toBe('en_US');
    expect(await metaContent(page, 'meta[property="og:image"]')).toBe(
      `${BASE}/og-default.png`
    );
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe(
      'summary_large_image'
    );

    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${BASE}/ar`
    );
  });

  test('machine page uses its own copy and falls back to the default card', async ({
    page,
  }) => {
    await page.goto(`${BASE}/en/machines/colina-belt-500`);

    expect(await metaContent(page, 'meta[property="og:title"]')).toBe(
      'Colina Belt 500'
    );
    expect(await metaContent(page, 'meta[property="og:description"]')).toBe(
      '500 mm wide conveyor belt.'
    );
    expect(await metaContent(page, 'meta[property="og:type"]')).toBe('website');
    expect(await metaContent(page, 'meta[property="og:image"]')).toBe(
      `${BASE}/og-default.png`
    );
    expect(await metaContent(page, 'meta[property="og:image:width"]')).toBe(
      '1200'
    );
    expect(await metaContent(page, 'meta[property="og:image:height"]')).toBe(
      '630'
    );
    expect(await metaContent(page, 'meta[name="twitter:card"]')).toBe(
      'summary_large_image'
    );
    expect(await metaContent(page, 'meta[name="twitter:image"]')).toBe(
      `${BASE}/og-default.png`
    );
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute(
      'href',
      `${BASE}/en/machines/colina-belt-500`
    );
  });
});

test('sitemap and robots point at the new public routes', async ({
  request,
}) => {
  const sitemap = await request.get(`${BASE}/sitemap.xml`);
  expect(sitemap.status()).toBe(200);
  const xml = await sitemap.text();

  for (const path of [
    '/ar/agents',
    '/en/agents',
    '/ar/categories',
    '/en/categories',
    '/ar/maintenance',
    '/en/maintenance',
    '/ar/machines/colina-belt-500',
    '/en/machines/colina-belt-500',
    '/ar/categories/conveying-systems',
    '/en/categories/conveying-systems',
  ]) {
    expect(xml).toContain(`<loc>${BASE}${path}</loc>`);
  }

  const robots = await request.get(`${BASE}/robots.txt`);
  expect(robots.status()).toBe(200);
  expect(await robots.text()).toContain(`Sitemap: ${BASE}/sitemap.xml`);
});
