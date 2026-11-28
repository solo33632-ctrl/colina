import AxeBuilder from '@axe-core/playwright';
import { test, expect, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createPartners,
  deletePartnersByTag,
  photoOf,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Every row this spec creates carries the tag in its slug or name, so a
// crashed run can be found by eye and removed with the same tag.
const TAG = 'st-a11y';
const STAMP = `${TAG}-${Date.now().toString(36)}`;

const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] as const;

const LOCALES = ['en', 'ar'] as const;
type Locale = (typeof LOCALES)[number];

// A seeded category and machine that always exist in the test database.
const PAGES = [
  { name: 'home', path: '' },
  { name: 'categories index', path: '/categories' },
  { name: 'category', path: '/categories/production-lines' },
  { name: 'machines index', path: '/machines' },
  { name: 'machine', path: '/machines/colina-belt-500' },
  { name: 'contact', path: '/contact' },
  { name: 'privacy', path: '/privacy' },
  { name: 'partners', path: '/partners' },
  { name: 'agents', path: '/agents' },
  { name: 'services', path: '/services' },
  { name: 'about', path: '/about' },
  { name: 'maintenance', path: '/maintenance' },
] as const;

// The category hero has three shapes: a tall photo, a wide photo and the
// solid dark field used when a category has no artwork. All three are checked
// in both locales because the breadcrumb sits on every one of them.
const HERO_VARIANTS = [
  { name: 'tall photo', slug: `${TAG}-tall-${STAMP}`, width: 400, height: 900 },
  {
    name: 'wide photo',
    slug: `${TAG}-wide-${STAMP}`,
    width: 1600,
    height: 500,
  },
  { name: 'no photo', slug: `${TAG}-plain-${STAMP}`, width: 0, height: 0 },
] as const;

const LOGO_NAMES: Record<Locale, string> = {
  en: 'Colina — Food production lines & maintenance',
  ar: 'كولينا — خطوط إنتاج الأغذية وخدمات الصيانة',
};

/** The home splash only plays once per session; these tests are not about it. */
async function skipIntro(page: Page) {
  await page.addInitScript(() => {
    try {
      sessionStorage.setItem('colina.intro-seen', '1');
    } catch {
      // A blocked-storage context is not what these tests are about.
    }
  });
}

/**
 * Waits for the entrance reveals to finish before axe measures colours.
 *
 * `Reveal` starts each section at `opacity: 0` and transitions it to 1, so an
 * axe run in the first half-second composites every heading and card against
 * the page background at partial opacity and reports false contrast failures.
 * The transitions (including their stagger delays) are finite; the partners
 * marquee is the one infinite animation and is deliberately not awaited.
 */
async function settleEntrance(page: Page) {
  // Let the reveal's two animation frames run and the transitions register.
  await page.waitForTimeout(150);
  await page.evaluate(async () => {
    const finite = document.getAnimations().filter((animation) => {
      const timing = animation.effect?.getComputedTiming();
      return timing?.iterations !== Number.POSITIVE_INFINITY;
    });
    await Promise.all(
      finite.map((animation) => animation.finished.catch(() => undefined))
    );
  });
}

/**
 * Runs axe with the WCAG 2.2 AA tag set and returns only the failures this
 * stage treats as blocking. Moderate and minor findings stay visible in the
 * report but do not fail the run; the confirmed audit found none of those on
 * these pages anyway.
 */
async function expectNoSeriousAxeViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags([...AXE_TAGS])
    .analyze();

  const blocking = results.violations
    .filter(
      (violation) =>
        violation.impact === 'serious' || violation.impact === 'critical'
    )
    .map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      help: violation.help,
      targets: violation.nodes.map((node) => node.target),
    }));

  expect(blocking, `${label}: serious or critical axe violations`).toEqual([]);
}

/**
 * Asserts the document outline: exactly one h1 and no heading level that
 * jumps by more than one. Runs against `<main>` so the header and footer,
 * which carry no headings, cannot affect the result.
 */
async function expectHeadingOrder(page: Page, label: string) {
  const headings = await page
    .locator('main')
    .locator('h1,h2,h3,h4,h5,h6')
    .evaluateAll((nodes) =>
      nodes.map((node) => ({
        level: Number(node.tagName.slice(1)),
        text: (node.textContent ?? '').trim().replace(/\s+/g, ' '),
      }))
    );

  expect(
    headings.filter((heading) => heading.level === 1),
    `${label}: exactly one h1`
  ).toHaveLength(1);

  let previous = 0;
  for (const [index, heading] of headings.entries()) {
    expect(
      heading.level,
      `${label}: heading ${index + 1} "${heading.text}" jumps from h${previous} to h${heading.level}`
    ).toBeLessThanOrEqual(previous + 1);
    previous = heading.level;
  }
}

test.beforeAll(() => {
  cleanupFixtures(TAG);
  deletePartnersByTag(TAG);

  for (const variant of HERO_VARIANTS) {
    createCategory({
      slug: variant.slug,
      nameEn: `A11y Hero ${variant.name} ${STAMP}`,
      nameAr: `بطل الوصول ${variant.name} ${STAMP}`,
      descriptionEn: 'Accessibility hero fixture.',
      descriptionAr: 'بيانات اختبار الوصول.',
      image:
        variant.width > 0 ? photoOf(variant.width, variant.height) : undefined,
    });
  }

  // Five partners is the marquee threshold; the seeded four are not enough to
  // prove the reduced-motion fallback against a real scrolling track.
  createPartners(
    Array.from({ length: 5 }, (_, index) => ({
      nameEn: `A11y Partner ${index + 1} ${STAMP}`,
      nameAr: `شريك الوصول ${index + 1} ${STAMP}`,
      logo: photoOf(320, 160),
    }))
  );
});

test.afterAll(() => {
  deletePartnersByTag(TAG);
  cleanupFixtures(TAG);
});

for (const locale of LOCALES) {
  for (const target of PAGES) {
    test.describe(`a11y ${target.name} (${locale})`, () => {
      test('has no serious or critical axe violations', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${target.path}`);
        await expect(page.getByRole('main')).toBeVisible();
        await settleEntrance(page);
        await expectNoSeriousAxeViolations(page, `${target.name} (${locale})`);
      });

      test('has one h1 and no skipped heading levels', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${target.path}`);
        await expect(page.getByRole('main')).toBeVisible();
        await expectHeadingOrder(page, `${target.name} (${locale})`);
      });
    });
  }
}

// The confirmed contrast failure lived on the category hero's breadcrumb, so
// the three hero shapes are exercised separately rather than relying on the
// one seeded category above.
for (const locale of LOCALES) {
  for (const variant of HERO_VARIANTS) {
    test(`category hero ${variant.name} (${locale}) has no serious or critical axe violations`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}/categories/${variant.slug}`);
      await expect(page.locator('#category-hero')).toBeVisible();
      await settleEntrance(page);
      await expectNoSeriousAxeViolations(
        page,
        `category hero ${variant.name} (${locale})`
      );
    });
  }
}

for (const locale of LOCALES) {
  test(`${locale}: the logo link has a localized accessible name`, async ({
    page,
  }) => {
    await skipIntro(page);
    await page.goto(`${WEB_URL}/${locale}`);

    const logo = page.getByRole('link', { name: LOGO_NAMES[locale] });
    await expect(logo).toBeVisible();
    await expect(logo.locator('img')).toHaveAttribute(
      'alt',
      LOGO_NAMES[locale]
    );
  });

  test(`${locale}: the skip link is the first Tab stop and focuses main`, async ({
    page,
  }) => {
    await skipIntro(page);
    await page.goto(`${WEB_URL}/${locale}/contact`);

    await page.keyboard.press('Tab');
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeFocused();
    await expect(skipLink).toBeVisible();

    await page.keyboard.press('Enter');
    await expect(page.locator('main#main-content')).toBeFocused();
  });
}

test.describe('mobile menu', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const locale of LOCALES) {
    test(`${locale}: Escape closes the panel and returns focus to the trigger`, async ({
      page,
    }) => {
      await skipIntro(page);
      await page.goto(`${WEB_URL}/${locale}`);

      const trigger = page.locator('button[aria-controls="mobile-menu"]');
      await trigger.click();
      await expect(trigger).toHaveAttribute('aria-expanded', 'true');

      const panel = page.locator('#mobile-menu');
      await expect(panel).toBeVisible();
      expect(
        await page.evaluate(
          () => document.activeElement?.closest('#mobile-menu') !== null
        ),
        'focus moved into the open panel'
      ).toBe(true);

      await page.keyboard.press('Escape');
      await expect(panel).toHaveCount(0);
      await expect(trigger).toHaveAttribute('aria-expanded', 'false');
      await expect(trigger).toBeFocused();
    });
  }
});

test('reduced motion: the intro overlay never renders', async ({ browser }) => {
  for (const locale of LOCALES) {
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();

    await page.goto(`${WEB_URL}/${locale}`);
    // Longer than the overlay's 1.12s animation, so a splash that ignored the
    // preference would already be attached.
    await page.waitForTimeout(1200);
    await expect(page.locator('[data-testid="intro-overlay"]')).toHaveCount(0);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

    await context.close();
  }
});

test('reduced motion: the partners marquee is static', async ({ browser }) => {
  for (const locale of LOCALES) {
    const context = await browser.newContext({
      reducedMotion: 'reduce',
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();

    await page.goto(`${WEB_URL}/${locale}/partners`);
    const marquee = page.locator('.colina-partners-marquee');
    // Five fixture partners guarantee the marquee threshold is met, so a
    // missing marquee is a real failure rather than a small-seed skip.
    await expect(marquee).toHaveCount(1);
    await marquee.scrollIntoViewIfNeeded();

    const state = await marquee.evaluate((element) => {
      const track = element.querySelector(
        '.colina-partners-track'
      ) as HTMLElement;
      const clones = [...element.querySelectorAll('[data-clone]')];
      return {
        animationName: getComputedStyle(track).animationName,
        visibleClones: clones.filter(
          (clone) => getComputedStyle(clone).display !== 'none'
        ).length,
        left: track.getBoundingClientRect().left,
      };
    });

    expect(state.animationName, `${locale}: track animation`).toBe('none');
    expect(state.visibleClones, `${locale}: duplicate logo sets`).toBe(0);

    await page.waitForTimeout(600);
    const leftAfter = await marquee
      .locator('.colina-partners-track')
      .evaluate((track) => track.getBoundingClientRect().left);
    expect(
      Math.abs(leftAfter - state.left),
      `${locale}: the static strip must not move`
    ).toBeLessThan(1);

    await context.close();
  }
});
