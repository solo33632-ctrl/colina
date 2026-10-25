import { test, expect, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  deleteSiteSettings,
  photoOf,
  runInDb,
  setSiteSettings,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// A machine page is the only place the sticky quote bar exists, so the
// floating button's collision rules are exercised there. The fixture follows
// machine-quote-bar.spec.ts: a tagged category and a machine with a photo and
// a long description, because the bar only appears between the summary CTA and
// the quote form.
const STAMP = Date.now().toString(36);
const TAG = 'st28a';
const CATEGORY = `${TAG}-wacat-${STAMP}`;
const MACHINE = `${TAG}-wam-${STAMP}`;

const NUMBER = '201001234567';
const DISPLAY_NUMBER = `+${NUMBER}`;
const CUSTOM_EN = 'Hello from the Colina e2e run';
const CUSTOM_AR = 'مرحباً من اختبار كولينا';
const DEFAULT_EN = "Hello, I'd like to ask about your services.";
const DEFAULT_AR = 'مرحباً، أود الاستفسار عن خدماتكم.';

const copy = {
  en: {
    buttonLabel: 'Chat with us on WhatsApp',
    contactLabel: 'WhatsApp',
    openImage: 'View full-size image',
  },
  ar: {
    buttonLabel: 'تواصل معنا عبر واتساب',
    contactLabel: 'واتساب',
    openImage: 'عرض الصورة بالحجم الكامل',
  },
} as const;

function expectedUrl(message: string) {
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(message)}`;
}

const whatsappButton = (page: Page) => page.getByTestId('whatsapp-button');
const quoteBar = (page: Page) => page.getByTestId('mobile-quote-bar');
const contactInfo = (page: Page) => page.getByTestId('contact-info');
const contactRow = (page: Page) =>
  contactInfo(page).getByTestId('whatsapp-contact-row');

async function buttonBox(page: Page) {
  const box = await whatsappButton(page).boundingBox();
  if (!box) {
    throw new Error('the WhatsApp button has no box');
  }
  return box;
}

/** The quote bar's box even while it is `visibility: hidden`. */
async function barBox(page: Page) {
  return quoteBar(page).evaluate((el) => {
    const rect = el.getBoundingClientRect();
    return {
      top: rect.top,
      bottom: rect.bottom,
      height: rect.height,
      visibility: getComputedStyle(el).visibility,
    };
  });
}

/**
 * The bar's box once it has finished sliding in.
 *
 * `toBeVisible()` becomes true as soon as `visibility` flips, which happens
 * before the 300ms transform has finished — measuring then reports a bar still
 * partway up the screen. Polling the bottom edge is enough: the transform is
 * the only thing moving, and at rest the bar is flush with the viewport.
 */
async function settledBarBox(page: Page) {
  const height = await page.evaluate(() => window.innerHeight);
  await expect
    .poll(
      async () => {
        const box = await barBox(page);
        return Math.abs(box.bottom - height) <= 1 ? 'settled' : 'moving';
      },
      { message: 'the quote bar finishes sliding in' }
    )
    .toBe('settled');
  return barBox(page);
}

/**
 * Scrolls to the description, where the summary CTA is above the viewport and
 * the quote form is below it. That is the only window in which the bar shows.
 */
async function scrollToDetails(page: Page) {
  await page
    .locator('#description-heading')
    .evaluate((el) => el.scrollIntoView({ block: 'start' }));
  await expect(page.locator('#description-heading')).toBeInViewport();
  await expect(page.locator('#quote-cta')).not.toBeInViewport();
  await expect(page.locator('#quote')).not.toBeInViewport();
}

/** Keyboard focus, then the visible indicator it must produce. */
async function expectVisibleFocus(page: Page) {
  await page.locator('footer a').last().focus();
  await page.keyboard.press('Tab');
  await expect(whatsappButton(page)).toBeFocused();

  const style = await whatsappButton(page).evaluate((el) => {
    const computed = getComputedStyle(el);
    return {
      outlineStyle: computed.outlineStyle,
      outlineWidth: computed.outlineWidth,
      boxShadow: computed.boxShadow,
    };
  });
  const hasOutline =
    style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0;
  const hasRing = style.boxShadow !== 'none' && style.boxShadow !== '';
  expect(hasOutline || hasRing).toBe(true);
}

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `WhatsApp Category ${STAMP}`,
    nameAr: `فئة واتساب ${STAMP}`,
    descriptionEn: 'A category created only for the WhatsApp specs.',
  });
  createMachine({
    slug: MACHINE,
    nameEn: `WhatsApp Fixture ${STAMP}`,
    nameAr: `آلة واتساب ${STAMP}`,
    shortDescriptionEn:
      'A fixture machine with a photo and a long description.',
    shortDescriptionAr: 'آلة تجريبية بصورة ووصف طويل.',
    categorySlug: CATEGORY,
    imageUrl: photoOf(600, 600),
  });

  // The description has to run for several screens at 390px, or the form is
  // already in view when the visitor reaches the heading and the quote bar
  // never appears. Four sentences cycled into a long body, exactly as the
  // quote-bar spec does it.
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
  deleteSiteSettings();
  cleanupFixtures();
});

for (const locale of ['en', 'ar'] as const) {
  const text = copy[locale];

  test(`${locale} at 1280px: the button is a localized new-tab link on the END side with a visible focus ring`, async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: NUMBER,
      whatsappMessageEn: CUSTOM_EN,
      whatsappMessageAr: CUSTOM_AR,
    });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto(`${WEB_URL}/${locale}`);

    const button = whatsappButton(page);
    await expect(button).toBeVisible();
    await expect(button).toHaveAttribute('aria-label', text.buttonLabel);
    await expect(button).toHaveAttribute(
      'href',
      expectedUrl(locale === 'ar' ? CUSTOM_AR : CUSTOM_EN)
    );
    await expect(button).toHaveAttribute('target', '_blank');
    const rel = await button.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');

    // A 56px circle, fully inside the viewport.
    const box = await buttonBox(page);
    expect(box.width).toBeCloseTo(56, 0);
    expect(box.height).toBeCloseTo(56, 0);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(1280);
    expect(box.y + box.height).toBeLessThanOrEqual(900);

    // Right in English, left in Arabic: `end-5` is 20px from the logical edge.
    if (locale === 'en') {
      expect(Math.abs(box.x + box.width - (1280 - 20))).toBeLessThanOrEqual(1);
    } else {
      expect(Math.abs(box.x - 20)).toBeLessThanOrEqual(1);
    }

    await expectVisibleFocus(page);
  });

  test(`${locale} at 390px: the button stays inside the viewport and clears the footer's last line`, async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: NUMBER,
      whatsappMessageEn: CUSTOM_EN,
      whatsappMessageAr: CUSTOM_AR,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}`);

    const box = await buttonBox(page);
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(390);
    expect(box.y + box.height).toBeLessThanOrEqual(844);

    // The page really reaches the end, and the fixed button sits below the
    // footer's last line rather than on top of it.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(
      Math.abs(footerBox!.y + footerBox!.height - 844)
    ).toBeLessThanOrEqual(2);

    const lastLine = footer.locator('p').last();
    const lastBox = await lastLine.boundingBox();
    expect(lastBox).not.toBeNull();
    const atBottom = await buttonBox(page);
    expect(atBottom.y).toBeGreaterThanOrEqual(lastBox!.y + lastBox!.height - 1);

    // The number is long enough to be a real overflow risk on a phone.
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('an empty stored greeting falls back to the locale default, in both locales', async ({
  page,
}) => {
  setSiteSettings({
    whatsappNumber: NUMBER,
    whatsappMessageEn: null,
    whatsappMessageAr: null,
  });
  await page.setViewportSize({ width: 1280, height: 900 });

  await page.goto(`${WEB_URL}/en`);
  await expect(whatsappButton(page)).toHaveAttribute(
    'href',
    expectedUrl(DEFAULT_EN)
  );

  await page.goto(`${WEB_URL}/ar`);
  await expect(whatsappButton(page)).toHaveAttribute(
    'href',
    expectedUrl(DEFAULT_AR)
  );
});

for (const locale of ['en', 'ar'] as const) {
  const text = copy[locale];

  test(`${locale} contact page: the WhatsApp row shows the same link and an LTR-isolated number`, async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: NUMBER,
      whatsappMessageEn: CUSTOM_EN,
      whatsappMessageAr: CUSTOM_AR,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/contact`);

    // Stage 34b moved the row inside the "Contact info" block beside the form.
    await expect(contactInfo(page)).toBeVisible();
    const row = contactRow(page);
    await expect(row).toBeVisible();
    await expect(row.getByText(text.contactLabel)).toBeVisible();

    const link = row.getByRole('link');
    await expect(link).toHaveAttribute(
      'href',
      expectedUrl(locale === 'ar' ? CUSTOM_AR : CUSTOM_EN)
    );
    await expect(link).toHaveAttribute('target', '_blank');
    const rel = await link.getAttribute('rel');
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');

    const number = link.locator('span[dir="ltr"]');
    await expect(number).toHaveText(DISPLAY_NUMBER);
    const bidi = await number.evaluate((el) => {
      const computed = getComputedStyle(el);
      return {
        direction: computed.direction,
        unicodeBidi: computed.unicodeBidi,
      };
    });
    expect(bidi.direction).toBe('ltr');
    expect(bidi.unicodeBidi).toBe('isolate');

    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth
    );
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('no row, a null number and an invalid number all render nothing', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  // No row at all.
  deleteSiteSettings();
  await page.goto(`${WEB_URL}/en`);
  await expect(whatsappButton(page)).toHaveCount(0);
  await page.goto(`${WEB_URL}/en/contact`);
  await expect(contactRow(page)).toHaveCount(0);
  await expect(whatsappButton(page)).toHaveCount(0);

  // A row with no number, but greetings stored: still no WhatsApp.
  setSiteSettings({
    whatsappNumber: null,
    whatsappMessageEn: CUSTOM_EN,
    whatsappMessageAr: CUSTOM_AR,
  });
  await page.goto(`${WEB_URL}/en`);
  await expect(whatsappButton(page)).toHaveCount(0);
  await page.goto(`${WEB_URL}/en/contact`);
  await expect(contactRow(page)).toHaveCount(0);

  // A stored value that is not a usable international number. The admin
  // refuses this, but a stale or hand-edited row must not produce a link.
  setSiteSettings({
    whatsappNumber: '0123',
    whatsappMessageEn: CUSTOM_EN,
    whatsappMessageAr: CUSTOM_AR,
  });
  await page.goto(`${WEB_URL}/en`);
  await expect(whatsappButton(page)).toHaveCount(0);
  await page.goto(`${WEB_URL}/en/contact`);
  await expect(contactRow(page)).toHaveCount(0);
});

for (const locale of ['en', 'ar'] as const) {
  test(`${locale} machine page at 390px: the button sits above the quote bar whether it is shown or hidden`, async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: NUMBER,
      whatsappMessageEn: CUSTOM_EN,
      whatsappMessageAr: CUSTOM_AR,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    // At the top the summary CTA is on screen, so the bar is hidden — but its
    // 73px of viewport is still reserved, and the button must not drop into
    // that band. The hidden bar is translated fully below the viewport, so its
    // own rect cannot be used as the reference; the reserved band can.
    await expect(quoteBar(page)).toBeHidden();
    const hiddenBar = await barBox(page);
    expect(hiddenBar.visibility).toBe('hidden');
    const topButton = await buttonBox(page);
    expect(topButton.y + topButton.height).toBeLessThanOrEqual(
      844 - hiddenBar.height - 8
    );

    // Reading the details: the bar slides in, and the gap stays.
    await scrollToDetails(page);
    await expect(quoteBar(page)).toBeVisible();
    const shownBar = await settledBarBox(page);
    expect(shownBar.visibility).toBe('visible');
    const readingButton = await buttonBox(page);
    expect(
      shownBar.top - (readingButton.y + readingButton.height)
    ).toBeGreaterThanOrEqual(8);
    expect(Math.abs(shownBar.bottom - 844)).toBeLessThanOrEqual(1);

    // At the very end of the page the footer's last line must clear the lifted
    // button, not just the bar. The extra footer padding exists for exactly
    // this; without it the wider copyright line could run under the button.
    await page.evaluate(() =>
      window.scrollTo(0, document.documentElement.scrollHeight)
    );
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
    const footerBox = await footer.boundingBox();
    expect(footerBox).not.toBeNull();
    expect(
      Math.abs(footerBox!.y + footerBox!.height - 844)
    ).toBeLessThanOrEqual(2);
    const lastLine = footer.locator('p').last();
    const lastBox = await lastLine.boundingBox();
    expect(lastBox).not.toBeNull();
    const atBottom = await buttonBox(page);
    expect(atBottom.y).toBeGreaterThanOrEqual(lastBox!.y + lastBox!.height - 1);
  });

  test(`${locale} machine page at 390px: the image lightbox is above the button`, async ({
    page,
  }) => {
    setSiteSettings({
      whatsappNumber: NUMBER,
      whatsappMessageEn: CUSTOM_EN,
      whatsappMessageAr: CUSTOM_AR,
    });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

    const opener = page.getByRole('button', { name: copy[locale].openImage });
    await expect(opener).toBeVisible();
    // Clicked in the DOM rather than through Locator.click(), which would
    // scroll the opener into view and move the fixed button off its mark.
    await opener.evaluate((el) => (el as HTMLElement).click());

    const dialog = page.locator('dialog[open]');
    await expect(dialog).toBeVisible();

    const centre = await whatsappButton(page).evaluate((el) => {
      const rect = el.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    });
    const hit = await page.evaluate(({ x, y }) => {
      const el = document.elementFromPoint(x, y);
      return {
        inDialog: Boolean(el?.closest('dialog[open]')),
        inButton: Boolean(el?.closest('[data-testid="whatsapp-button"]')),
      };
    }, centre);
    expect(hit.inDialog).toBe(true);
    expect(hit.inButton).toBe(false);

    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
  });
}
