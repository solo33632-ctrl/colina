import { test, expect, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
  runInDb,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// A machine page is long on a phone — photo, summary, details, form — and the
// one button that matters is near the top of it. The mobile quote bar exists so
// a visitor who has scrolled past that button still has one tap to the form.
//
// These tests pin the two properties that make it usable rather than annoying:
// it appears ONLY in the gap between the button and the form (never on top of
// either, and never on desktop), and when it is not showing it is genuinely
// gone — not a transparent link sitting over the footer.
//
// Fixtures go straight to the database (db-fixture.ts) and are tagged and
// removed in `afterAll`. Nothing here submits anything: the bar's link is an
// in-page anchor, and the endpoint behind the form allows only a handful of
// POSTs per IP per ten minutes which the catalog and quote specs already spend.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-barcat-${STAMP}`;
const MACHINE = `${TAG}-barm-${STAMP}`;
const SIBLING = `${TAG}-barsib-${STAMP}`;

/**
 * The bar.
 *
 * `data-testid` because there is nothing else to select it by: it is a plain
 * fixed-position <div> with no role and no accessible name of its own (its
 * single child is the link, which is asserted separately).
 */
const bar = (page: Page) => page.getByTestId('mobile-quote-bar');

/** The bar's button — the same call to action the summary block carries. */
const barLink = (page: Page) => bar(page).locator('a');

const copy = {
  en: {
    requestQuote: 'Request a quote',
    openImage: 'View full-size image',
    submit: 'Send quote request',
  },
  ar: {
    requestQuote: 'اطلب عرض سعر',
    openImage: 'عرض الصورة بالحجم الكامل',
    submit: 'إرسال طلب عرض السعر',
  },
} as const;

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Quote Bar Category ${STAMP}`,
    nameAr: `فئة شريط العرض ${STAMP}`,
    descriptionEn: 'A category created only for the mobile quote bar specs.',
  });
  createMachine({
    slug: MACHINE,
    nameEn: `Quote Bar Fixture ${STAMP}`,
    nameAr: `آلة شريط العرض ${STAMP}`,
    shortDescriptionEn:
      'A fixture machine with a photo, a description and specs.',
    shortDescriptionAr: 'آلة تجريبية بها صورة ووصف ومواصفات.',
    categorySlug: CATEGORY,
    imageUrl: photoOf(600, 600),
  });
  // A second machine in the same category, which is what makes the "related
  // machines" strip render. It exists for the bottom-of-the-page clearance: the
  // strip is the only thing that can stand between the form and the footer, and
  // without it the form is the last thing on the page — so the form's own
  // intersection would be what hides the bar there, and the footer's reserved
  // padding would never be exercised at all.
  createMachine({
    slug: SIBLING,
    nameEn: `Quote Bar Sibling ${STAMP}`,
    nameAr: `آلة مجاورة ${STAMP}`,
    shortDescriptionEn:
      'A sibling machine, so the related strip has something in it.',
    shortDescriptionAr: 'آلة مجاورة، ليتوفر شريط الآلات ذات الصلة.',
    categorySlug: CATEGORY,
    imageUrl: photoOf(800, 200),
  });
  // `createMachine` seeds the long-form fields blank — they are optional — and
  // the description/specs sections only render when they are filled. The bar's
  // whole purpose is the stretch of page BETWEEN the summary and the form, so
  // the fixture has to actually have that stretch.
  //
  // It has to be a stretch and not merely a paragraph: on a 390px phone the
  // details have to run for several screens, or the form is already on screen
  // while the visitor is reading and there is no gap for the bar to occupy.
  // Four sentences are cycled into a long body so the copy still reads as
  // machine documentation rather than as a single sentence repeated.
  const sentencesEn = [
    'The line is built around a stainless steel frame that keeps the product path sealed from the operator side.',
    'Changeover between two products takes under four minutes without tools, using the tool-free guide rails.',
    'Every station reports its own cycle time, so a slow step is visible on the line rather than hidden in the total.',
    'The control cabinet is mounted at waist height, which keeps the emergency stop within reach of anyone on the floor.',
  ];
  const sentencesAr = [
    'الخط مبني على هيكل من الفولاذ المقاوم للصدأ يحافظ على مسار المنتج مغلقًا بعيدًا عن جانب المشغّل.',
    'يتطلب تغيير المنتج من نوع إلى آخر أقل من أربع دقائق دون أدوات، بفضل القضبان التوجيهية الخالية من الأدوات.',
    'تبلغ كل محطة زمن دورتها الخاص، فتصبح الخطوة البطيئة مرئية على الخط بدل أن تختفي في الزمن الكلي.',
    'تُركَّب لوحة التحكم على مستوى الخصر، فيبقى زر الإيقاف الطارئ في متناول أي شخص يعمل على أرضية المصنع.',
  ];
  const longCopy = (sentences: string[], repeats: number) =>
    Array.from({ length: repeats })
      .flatMap(() => sentences)
      .join(' ');

  runInDb(`
    await prisma.machine.update({
      where: { slug: ${JSON.stringify(MACHINE)} },
      data: {
        descriptionEn: ${JSON.stringify(longCopy(sentencesEn, 14))},
        descriptionAr: ${JSON.stringify(longCopy(sentencesAr, 14))},
        specsEn: 'Capacity: 2,000 units per hour. Footprint: 6 x 3 m. Power: 24 kW.',
        specsAr: 'الطاقة الإنتاجية: 2000 وحدة في الساعة. المساحة: 6 × 3 م. الاستهلاك: 24 كيلوواط.',
      },
    });
  `);
});

test.afterAll(() => {
  cleanupFixtures();
});

/**
 * Scrolls so the description heading sits at the top of the viewport.
 *
 * That is the reading position the bar is for: the photo and the summary button
 * are both above the fold by now, and the form is still well below. `block:
 * 'start'` rather than `scrollIntoViewIfNeeded`, which only nudges an element
 * to the nearest edge and can leave the button still on screen.
 */
async function scrollToDetails(page: Page) {
  await page
    .locator('#description-heading')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(page.locator('#description-heading')).toBeInViewport();
  await expect(page.locator('#quote-cta')).not.toBeInViewport();
  await expect(page.locator('#quote')).not.toBeInViewport();
}

/**
 * The bar's box in viewport coordinates, or null while it is not showing.
 *
 * Hidden means `visibility: hidden`, so the box still has a size while the bar
 * is faded out — measuring the rect alone would report a full-width bar at the
 * bottom of the page on every assertion in this file, including the ones about
 * it not being there.
 */
async function barBox(page: Page) {
  return bar(page).evaluate((el) => {
    const style = getComputedStyle(el);
    if (style.visibility === 'hidden' || style.display === 'none') {
      return null;
    }
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      viewportWidth: document.documentElement.clientWidth,
      viewportHeight: document.documentElement.clientHeight,
    };
  });
}

type BarBox = NonNullable<Awaited<ReturnType<typeof barBox>>>;

/**
 * The bar's box once it has finished moving, or null once it has finished hiding.
 *
 * Showing and hiding are animated, and every geometry assertion below would
 * otherwise race that animation: a box read mid-slide is a bar partway up the
 * screen, which fails a "flush with the bottom of the viewport" check for
 * reasons that have nothing to do with the bar being wrong. At rest the bar is
 * either gone (`visibility: hidden`, the `null` branch) or sitting exactly on the
 * bottom edge — the translate and the opacity are the only two things that move,
 * so the bottom edge is a complete proxy for "finished".
 */
async function settledBarBox(page: Page): Promise<BarBox | null> {
  await expect
    .poll(
      async () => {
        const box = await barBox(page);
        if (box === null) return 'hidden';
        return Math.abs(box.bottom - box.viewportHeight) <= 1
          ? 'shown'
          : 'moving';
      },
      { message: 'the bar finishes sliding in or out' }
    )
    .not.toBe('moving');
  return barBox(page);
}

for (const locale of ['en', 'ar'] as const) {
  const text = copy[locale];

  test(`${locale} at 390px: the bar is hidden at the top and appears over the details`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    // At the top of the page the summary button is on screen, so a second copy
    // of the same call to action would be noise: the bar must not be there.
    await expect(page.locator('#quote-cta')).toBeInViewport();
    await expect(bar(page)).toBeHidden();

    await scrollToDetails(page);

    // Reading the details: the button is gone from the screen and the form is
    // still below the fold, and now the bar appears.
    const box = await settledBarBox(page);
    expect(box).not.toBeNull();

    // Pinned to the bottom of the viewport, and as wide as it.
    expect(Math.abs(box!.bottom - box!.viewportHeight)).toBeLessThanOrEqual(1);
    expect(box!.left).toBeLessThanOrEqual(1);
    expect(box!.right).toBeGreaterThanOrEqual(box!.viewportWidth - 1);

    // One tap to the form, with the same label the summary button carries.
    const link = barLink(page);
    await expect(link).toHaveCount(1);
    await expect(link).toHaveAttribute('href', '#quote');
    await expect(link).toHaveText(text.requestQuote);
  });

  test(`${locale} at 390px: the bar's link reaches the form and the bar gets out of the way`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);
    await scrollToDetails(page);

    await barLink(page).click();

    // The form's heading is on screen — that is the point of the bar.
    await expect(page).toHaveURL(/#quote$/);
    await expect(page.locator('#quote-heading')).toBeInViewport();

    // And the bar has gone: `#quote` intersecting the viewport is what hides it,
    // so the visitor lands on the form with nothing on top of it.
    await expect(bar(page)).toBeHidden();
  });

  test(`${locale} at 390px: the bar never covers the form it points at`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);
    await scrollToDetails(page);

    // Click through to the form, then park the viewport where the fields are on
    // screen — the position where a fixed bar and a form are most likely to
    // fight over the same pixels.
    await barLink(page).click();
    await expect(page.locator('#quote-heading')).toBeInViewport();

    const submit = page.getByRole('button', { name: text.submit });
    await expect(submit).toBeInViewport();

    const box = await settledBarBox(page);

    // Either the bar is gone, or it starts below the last thing on the form.
    // "Either/or" rather than "always gone", because the requirement is that the
    // form is not covered — not that one particular implementation hides the bar
    // at this exact scroll position. Both branches are asserted, so a bar that
    // is present but overlapping still fails.
    if (box === null) {
      expect(box).toBeNull();
    } else {
      const submitBottom = await submit.evaluate(
        (el) => el.getBoundingClientRect().bottom
      );
      expect(box.top).toBeGreaterThanOrEqual(submitBottom - 1);
    }

    // The last field is reachable and not behind the bar either.
    const message = page.locator('#quote-message');
    await expect(message).toBeInViewport();
    if (box !== null) {
      const messageBottom = await message.evaluate(
        (el) => el.getBoundingClientRect().bottom
      );
      expect(box.top).toBeGreaterThanOrEqual(messageBottom - 1);
    }
  });

  test(`${locale} at 390px: the very bottom of the page covers nothing`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );

    // At the end of the document the footer is the last thing there is, so a bar
    // with no clearance of its own would sit permanently on top of the footer's
    // links and copyright line. Either the bar has hidden by now, or the page
    // padded the footer enough that everything still clears it.
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();

    // Precondition, so this cannot quietly become a test of nothing: the
    // related strip has to be what is on screen here, not the form. The form's
    // own intersection hides the bar by itself, and then the footer's padding
    // would never be exercised.
    await expect(page.locator('#related-heading')).toBeInViewport();
    await expect(page.locator('#quote')).not.toBeInViewport();

    const footerInfo = await footer.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      // The tagline is the footer's last child and its lowest line of text — the
      // first thing a bar with no clearance would cover.
      const last = el.lastElementChild!.getBoundingClientRect();
      return {
        bottom: rect.bottom,
        viewportHeight: document.documentElement.clientHeight,
        lastContentBottom: last.bottom,
      };
    });

    // The page really did reach the end, rather than stopping short.
    expect(
      Math.abs(footerInfo.bottom - footerInfo.viewportHeight)
    ).toBeLessThanOrEqual(2);

    const box = await settledBarBox(page);
    // The precondition above means the bar really is showing here, so this is a
    // direct assertion rather than an "either/or": the footer's last line of
    // text has to clear the top of the bar. Without the footer's reserved
    // padding the tagline would sit at the very bottom of the viewport instead
    // and this would fail.
    expect(box).not.toBeNull();
    expect(box!.top).toBeGreaterThanOrEqual(footerInfo.lastContentBottom - 1);
  });

  test(`${locale} at 1280px: the bar is absent, visually and for assistive tech`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    // `display: none` below `lg`, so it is not painted and not in the layout.
    await expect(bar(page)).toBeHidden();

    // Still shown while reading the details — the decision logic is width-blind,
    // the element simply has nothing to show at this width.
    await scrollToDetails(page);
    await expect(bar(page)).toBeHidden();

    // And the accessibility tree knows nothing about it: the only link with
    // this name on a desktop page is the summary button.
    await expect(page.locator('#quote-cta')).toHaveCount(1);
    await expect(
      page.getByRole('link', { name: text.requestQuote })
    ).toHaveCount(1);

    // Nor does the tab order: tabbing forward from the page's first control
    // never arrives at a second copy of the call to action.
    await page.locator('#quote-cta').focus();
    for (let step = 0; step < 10; step += 1) {
      await page.keyboard.press('Tab');
      const inBar = await page.evaluate(() =>
        Boolean(
          document.activeElement?.closest('[data-testid="mobile-quote-bar"]')
        )
      );
      expect(inBar).toBe(false);
    }
  });

  test(`${locale} at 390px: a hidden bar is out of the tab order, a shown one is not`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    // Hidden at the top of the page. A transparent-but-present bar would still
    // be focusable, so a keyboard user could tab into a control they cannot see
    // — and, because the bar is fixed at the bottom, into one sitting on top of
    // the footer. The hidden state has to be inert, not merely faint.
    await expect(bar(page)).toBeHidden();
    await expect(bar(page)).toHaveAttribute('aria-hidden', 'true');
    // `inert` is the attribute that actually removes a subtree from the tab
    // order and from hit-testing; the others are belt and braces.
    await expect(bar(page)).toHaveJSProperty('inert', true);

    // Focusing it directly is refused while it is inert — the same refusal a Tab
    // keypress gets, and the sharpest form of the claim.
    const focusRefused = await barLink(page).evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement !== el;
    });
    expect(focusRefused).toBe(true);

    // And a real Tab sweep from the last focusable control before the bar never
    // lands in it either. Focused at the form's first field, which sits above the
    // bar in DOM order and is itself on the way to the rest of the form, so the
    // sweep reaches real controls the whole way.
    await page.locator('#quote-cta').focus();
    await page.locator('#quote-name').focus();
    let reachedSubmit = false;
    for (let step = 0; step < 40; step += 1) {
      await page.keyboard.press('Tab');
      const state = await page.evaluate(() => ({
        inBar: Boolean(
          document.activeElement?.closest('[data-testid="mobile-quote-bar"]')
        ),
        id: document.activeElement?.id ?? '',
        tag: document.activeElement?.tagName ?? '',
      }));
      expect(state.inBar).toBe(false);
      if (state.tag === 'BUTTON' && !state.id) {
        reachedSubmit = true;
        break;
      }
    }
    // The sweep is a real one: it walked the form's controls rather than
    // wrapping straight back to the top of the document.
    expect(reachedSubmit).toBe(true);

    // Once the bar IS showing, the very same link must be focusable. Without
    // this the assertions above would also pass for a bar that was `inert`
    // forever and therefore unreachable even when it was wanted.
    await scrollToDetails(page);
    await expect(barLink(page)).toBeVisible();
    const focusAccepted = await barLink(page).evaluate((el) => {
      (el as HTMLElement).focus();
      return document.activeElement === el;
    });
    expect(focusAccepted).toBe(true);
  });

  test(`${locale} at 390px: the gallery lightbox covers the bar`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    // Put the bar on screen first. At the photo — the only place the opener is —
    // the bar is hidden by design, so the overlap has to be arranged rather than
    // waited for, or this test would assert nothing.
    await scrollToDetails(page);
    await expect(bar(page)).toBeVisible();

    // Clicked in the DOM rather than through `Locator.click()`, which would
    // scroll the opener into view and take the bar off screen again. The
    // lightbox is what the button opens either way.
    await page
      .getByRole('button', { name: text.openImage })
      .evaluate((el) => (el as HTMLElement).click());

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();
    // The bar is still there, still laid out, still at the bottom.
    const box = await settledBarBox(page);
    expect(box).not.toBeNull();

    // A native modal <dialog> is painted in the top layer, above every z-index
    // in the document, so the bar cannot be over it whatever its z-40 says. Hit
    // tested at the middle of the bar, which is the only place they can overlap.
    const barCentre = await bar(page).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });

    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        inDialog: Boolean(el?.closest('dialog[open]')),
        inBar: Boolean(el?.closest('[data-testid="mobile-quote-bar"]')),
      };
    }, barCentre);
    expect(hit.inDialog).toBe(true);
    expect(hit.inBar).toBe(false);

    // And the backdrop really is over the bar too, not just its own image.
    const backdrop = await dialog.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return {
        coversBar: rect.top < window.innerHeight - 1,
        width: rect.width,
        height: rect.height,
      };
    });
    expect(backdrop.width).toBeGreaterThanOrEqual(390);
    expect(backdrop.coversBar).toBe(true);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}
