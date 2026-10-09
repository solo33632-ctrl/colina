import { test, expect } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const SECTION = 'section[aria-labelledby="partners-heading"]';
const MARQUEE = '.colina-partners-marquee';
const TRACK = '.colina-partners-track';

// The partners section, in both the locales it ships in and on both routes
// that render it: the home page strip and the /partners listing page. They
// share one component, so anything true here is true on both.
const PAGES = [
  { name: 'home', path: '' },
  { name: 'partners page', path: '/partners' },
] as const;

const LOCALES = ['en', 'ar'] as const;

/** The home page's brand intro only plays once; not what these tests cover. */
async function skipIntro(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    sessionStorage.setItem('colina.intro-seen', '1');
  });
}

for (const { name, path } of PAGES) {
  for (const locale of LOCALES) {
    test.describe(`partners section (${name}, ${locale})`, () => {
      test.use({ viewport: { width: 1280, height: 900 } });

      test('renders no partner logo cropped', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${path}`);
        const section = page.locator(SECTION);
        await section.scrollIntoViewIfNeeded();

        const logos = await section.locator('img').evaluateAll((nodes) =>
          nodes
            // Cloned copies are display:none under reduced motion; only measure
            // the ones actually laid out.
            .filter((img) => img.getBoundingClientRect().width > 0)
            .map((img) => {
              const r = img.getBoundingClientRect();
              const tile = (
                img.parentElement as HTMLElement
              ).getBoundingClientRect();
              return {
                alt: img.alt,
                fit: getComputedStyle(img).objectFit,
                overflowsX: r.width > tile.width + 1,
                overflowsY: r.height > tile.height + 1,
              };
            })
        );

        // An empty section is legitimate (no partners seeded yet), so only
        // assert on what is actually on the page.
        for (const logo of logos) {
          // A logo must be *contained*, never *covered*: `object-fit: cover`
          // is what amputated the M from "Mondelez International".
          expect(logo.fit, `${logo.alt} must not be cover-fitted`).toBe(
            'contain'
          );
          expect(
            logo.overflowsX,
            `${logo.alt} overflows its tile horizontally`
          ).toBe(false);
          expect(
            logo.overflowsY,
            `${logo.alt} overflows its tile vertically`
          ).toBe(false);
        }
      });

      test('gives every logo a caption and an alt text', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${path}`);
        const section = page.locator(SECTION);
        await section.scrollIntoViewIfNeeded();

        const names = await section.locator('img').evaluateAll((nodes) =>
          nodes
            .filter((img) => img.getBoundingClientRect().width > 0)
            .map((img) => ({
              alt: img.alt.trim(),
              caption:
                img.closest('li')?.querySelector('p')?.textContent?.trim() ??
                '',
            }))
        );
        for (const { alt, caption } of names) {
          expect(alt).not.toBe('');
          expect(caption).not.toBe('');
        }
      });

      test('keeps every logo tile the same height', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${path}`);
        const section = page.locator(SECTION);
        await section.scrollIntoViewIfNeeded();

        // The point of fitting the logo rather than stretching it: a row of
        // tiles lines up whatever shape each logo is.
        const heights = await section
          .locator('img')
          .evaluateAll((nodes) =>
            nodes
              .filter((img) => img.getBoundingClientRect().width > 0)
              .map(
                (img) =>
                  (img.parentElement as HTMLElement).getBoundingClientRect()
                    .height
              )
          );
        if (heights.length > 1) {
          expect(new Set(heights).size).toBe(1);
        }
      });

      // A strip several thousand pixels wide must never widen the document in
      // either direction — the honeypot bug on the Arabic pages was exactly
      // this, in a physical `left` offset.
      test('does not widen the document', async ({ page }) => {
        await skipIntro(page);
        await page.goto(`${WEB_URL}/${locale}${path}`);
        await page.locator(SECTION).scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);

        const widths = await page.evaluate(() => ({
          scroll: document.scrollingElement!.scrollWidth,
          client: document.documentElement.clientWidth,
        }));
        expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
      });

      // Scrolling animations are opted into only above a minimum partner
      // count, so with a small seeded list these are the marquee tests'
      // reduced-motion counterpart rather than a duplicate.
      test('reduced motion never leaves a scrolling strip', async ({
        browser,
      }) => {
        const context = await browser.newContext({
          reducedMotion: 'reduce',
          viewport: { width: 1280, height: 900 },
        });
        const p = await context.newPage();
        await skipIntro(p);
        await p.goto(`${WEB_URL}/${locale}${path}`);
        const section = p.locator(SECTION);
        await section.scrollIntoViewIfNeeded();
        await p.waitForTimeout(400);

        const state = await section.evaluate((el) => {
          const track = el.querySelector(
            '.colina-partners-track'
          ) as HTMLElement | null;
          return {
            animating: track
              ? getComputedStyle(track).animationName !== 'none' &&
                getComputedStyle(track).animationPlayState === 'running'
              : false,
            // The duplicate set exists only to make the loop seamless.
            clonesShown:
              el.querySelectorAll('[data-clone]').length -
              [...el.querySelectorAll('[data-clone]')].filter(
                (c) => getComputedStyle(c).display === 'none'
              ).length,
          };
        });
        expect(state.animating).toBe(false);
        expect(state.clonesShown).toBe(0);
        await context.close();
      });
    });
  }
}

// The marquee's own behaviour. Skipped when the seeded list is below the
// threshold the section uses to fall back to the static grid — with four
// partners the section correctly does not marquee, so there is no strip here
// to assert on.
test.describe('partners marquee', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('scrolls sideways and loops seamlessly', async ({ page }) => {
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en`);
    const marquee = page.locator(MARQUEE);
    // Counted before it is scrolled to: when the section has correctly fallen
    // back to the static grid the element does not exist at all.
    test.skip(
      (await marquee.count()) === 0,
      'fewer partners than the marquee threshold: the static grid is in use'
    );
    await marquee.scrollIntoViewIfNeeded();

    const geometry = await page.locator(TRACK).evaluate((track) => {
      const items = [...track.children] as HTMLElement[];
      const clone = items.find((el) => el.hasAttribute('data-clone'))!;
      return {
        total: items.length,
        clones:
          items.length -
          items.filter((el) => !el.hasAttribute('data-clone')).length,
        // The seam: translating by exactly half the track must land the first
        // clone precisely where the first real card began. A flex `gap`
        // between the halves would put half a gap in here and drift every loop.
        seamError: Math.abs(
          clone.getBoundingClientRect().left -
            items[0].getBoundingClientRect().left -
            track.getBoundingClientRect().width / 2
        ),
        animationName: getComputedStyle(track).animationName,
        clonesHiddenFromAT: clone.getAttribute('aria-hidden') === 'true',
      };
    });

    expect(geometry.animationName).toBe('colina-partners-scroll');
    // One duplicated pass, and the loop is exact.
    expect(geometry.clones).toBeGreaterThan(0);
    expect(geometry.seamError).toBeLessThan(1);
    // Announced once, not twice.
    expect(geometry.clonesHiddenFromAT).toBe(true);

    // It actually moves, leftwards, on a transform (not `left`/`margin`).
    const x = () =>
      page.locator(TRACK).evaluate((t) => t.getBoundingClientRect().left);
    const before = await x();
    await page.waitForTimeout(1200);
    const after = await x();
    expect(after).toBeLessThan(before);
  });

  // Only hover is exercised here. The keyboard half of the pause rides on
  // `:focus-within`, which cannot be reached by tabbing today because nothing
  // inside a partner card is focusable — `Partner` has no URL column yet. The
  // rule is written so that it starts working the moment a card contains a
  // link, with no change to the test.
  test('pauses on hover', async ({ page }) => {
    await skipIntro(page);
    await page.goto(`${WEB_URL}/en`);
    const marquee = page.locator(MARQUEE);
    test.skip(
      (await marquee.count()) === 0,
      'fewer partners than the marquee threshold: the static grid is in use'
    );
    await marquee.scrollIntoViewIfNeeded();

    const x = () =>
      page.locator(TRACK).evaluate((t) => t.getBoundingClientRect().left);
    const playState = () =>
      page
        .locator(TRACK)
        .evaluate((t) => getComputedStyle(t).animationPlayState);

    expect(await playState()).toBe('running');

    await marquee.hover();
    await page.waitForTimeout(200);
    expect(await playState()).toBe('paused');

    // A paused strip must actually hold still, not just be labelled paused.
    const pausedAt = await x();
    await page.waitForTimeout(1000);
    expect(Math.abs((await x()) - pausedAt)).toBeLessThan(1);

    // Moving away resumes it.
    await page.mouse.move(5, 5);
    await page.waitForTimeout(200);
    expect(await playState()).toBe('running');
  });
});
