import { test, expect, type Page } from '@playwright/test';
import {
  cleanupFixtures,
  createCategory,
  createMachine,
  photoOf,
  runInDb,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// The machine page has to lead somewhere: photo, what this machine is, one
// clear "request a quote" button, the detail sections, and then the form
// itself. Before this the form was a sticky side panel beside the photo, so a
// visitor who wanted a quote had to find it among the page furniture.
//
// Fixtures are written straight to the database (db-fixture.ts) rather than
// through the admin UI, and every one is tagged and removed again in
// `afterAll`. The lead this spec creates is deleted by its own unique email, so
// the run leaves the database as it found it.

const STAMP = Date.now().toString(36);
const TAG = 'st28a';

const CATEGORY = `${TAG}-quotecat-${STAMP}`;
const MACHINE = `${TAG}-quotem-${STAMP}`;
const SINGLE = `${TAG}-quotesingle-${STAMP}`;
// Unique per run, so the cleanup below can find the lead by email alone.
const LEAD_EMAIL = `quote-${STAMP}@example.com`;

/** Deletes one lead by email, whatever this run created. */
function deleteLead() {
  try {
    runInDb(`
      await prisma.maintenanceRequest.deleteMany({
        where: { email: ${JSON.stringify(LEAD_EMAIL)} },
      });
    `);
  } catch {
    // Cleanup must never mask the test result that triggered it.
  }
}

test.beforeAll(() => {
  createCategory({
    slug: CATEGORY,
    nameEn: `Quote Category ${STAMP}`,
    nameAr: `فئة العروض ${STAMP}`,
    descriptionEn: 'A category created only for the quote-section specs.',
  });
  createMachine({
    slug: MACHINE,
    nameEn: `Quote Fixture ${STAMP}`,
    nameAr: `آلة العروض ${STAMP}`,
    shortDescriptionEn:
      'A fixture machine with a photo and a full description.',
    shortDescriptionAr: 'آلة تجريبية بها صورة ووصف كامل.',
    categorySlug: CATEGORY,
    imageUrl: photoOf(600, 600),
  });
  createMachine({
    slug: SINGLE,
    nameEn: `Quote Single ${STAMP}`,
    nameAr: `آلة واحدة ${STAMP}`,
    shortDescriptionEn: 'A fixture machine with no photo at all.',
    shortDescriptionAr: 'آلة تجريبية بدون صور.',
    categorySlug: CATEGORY,
  });
  // `createMachine` seeds the long-form fields blank — they are optional — so
  // without this the description and specs sections would be absent and the
  // ordering assertion would have nothing to order against. Giving them real
  // copy is also the more representative case: a full machine page has all three
  // sections.
  runInDb(`
    const rows = await prisma.machine.findMany({
      where: { slug: { in: [${JSON.stringify(MACHINE)}, ${JSON.stringify(SINGLE)}] } },
    });
    for (const row of rows) {
      await prisma.machine.update({
        where: { id: row.id },
        data: {
          descriptionEn: 'A fixture machine built only for the quote specs.',
          descriptionAr: 'آلة تجريبية أُنشئت لاختبارات عروض الأسعار فقط.',
          specsEn: 'Capacity: 2,000 units per hour. Footprint: 6 x 3 m.',
          specsAr: 'الطاقة الإنتاجية: 2000 وحدة في الساعة. المساحة: 6 × 3 م.',
        },
      });
    }
  `);
});

test.afterAll(() => {
  deleteLead();
  cleanupFixtures();
});

/** Tops of the main page landmarks, in document order. */
async function landmarkTops(page: Page) {
  return page.evaluate(() => {
    const top = (selector: string) => {
      const el = document.querySelector(selector);
      return el ? el.getBoundingClientRect().top : Number.NaN;
    };
    return {
      summary: top('h1'),
      description: top('#description-heading'),
      specs: top('#specs-heading'),
      quote: top('#quote'),
      related: top('#related-heading'),
    };
  });
}

for (const locale of ['en', 'ar'] as const) {
  const copy = {
    en: {
      requestQuote: 'Request a quote',
      quoteHeading: 'Request a quote for this machine',
      name: 'Name',
      phone: 'Phone',
      email: 'Email (optional)',
      company: 'Company (optional)',
      message: 'Message',
      submit: 'Send quote request',
      success: 'Thank you — your quote request was received.',
    },
    ar: {
      requestQuote: 'اطلب عرض سعر',
      quoteHeading: 'اطلب عرض سعر لهذه الماكينة',
      name: 'الاسم',
      phone: 'الهاتف',
      email: 'البريد الإلكتروني (اختياري)',
      company: 'الشركة (اختياري)',
      message: 'الرسالة',
      submit: 'إرسال طلب عرض السعر',
      success: 'شكرًا لك — تم استلام طلب عرض السعر.',
    },
  }[locale];

  for (const width of [1280, 390] as const) {
    test(`${locale} at ${width}px: one h1, and a button that jumps to the form`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

      // Exactly one h1: the machine name in the summary block. The summary was
      // moved out of the top of the page into the column beside the gallery, so
      // this is the thing that could have gone wrong. The name is localized, so
      // the Arabic page is checked against the Arabic one.
      await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
      await expect(page.getByRole('heading', { level: 1 })).toHaveText(
        locale === 'en' ? `Quote Fixture ${STAMP}` : `آلة العروض ${STAMP}`
      );

      // The button is a plain anchor to the form further down the page.
      const button = page.getByRole('link', { name: copy.requestQuote });
      await expect(button).toHaveCount(1);
      await expect(button).toHaveAttribute('href', '#quote');

      // Clicking it brings the form's heading into view — and clear of the
      // sticky site header, which is what `scroll-mt` is for.
      await button.click();
      await expect(page).toHaveURL(/#quote$/);
      const heading = page.locator('#quote-heading');
      await expect(heading).toBeVisible();
      const headerHeight = await page
        .locator('header')
        .first()
        .evaluate((el) => el.getBoundingClientRect().height)
        .catch(() => 0);
      const headingTop = await heading.evaluate(
        (el) => el.getBoundingClientRect().top
      );
      expect(headingTop).toBeGreaterThanOrEqual(headerHeight - 2);
    });

    test(`${locale} at ${width}px: the form sits after the details and before related machines`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);

      const tops = await landmarkTops(page);
      // Reading order: what it is -> the details -> the form -> what else there
      // is. Every landmark is asserted present first, so the ordering is a real
      // comparison rather than a chain of comparisons against NaN (which are
      // always false, and would therefore pass while testing nothing).
      expect(Number.isNaN(tops.description)).toBe(false);
      expect(Number.isNaN(tops.specs)).toBe(false);
      expect(Number.isNaN(tops.quote)).toBe(false);
      expect(tops.summary).toBeLessThan(tops.description);
      expect(tops.description).toBeLessThan(tops.specs);
      expect(tops.specs).toBeLessThan(tops.quote);

      // Related machines come last, when this machine has any.
      const hasRelated = !Number.isNaN(tops.related);
      if (hasRelated) {
        expect(tops.quote).toBeLessThan(tops.related);
      }
    });

    test(`${locale} at ${width}px: the form is two columns on desktop and one on a phone`, async ({
      page,
    }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`${WEB_URL}/${locale}/machines/${MACHINE}`);
      const form = page.locator('form:has(#quote-name)');
      await expect(form).toHaveCount(1);

      const boxes = await page.evaluate(() => {
        const read = (id: string) => {
          const el = document.getElementById(id)!;
          const rect = el.getBoundingClientRect();
          return { top: Math.round(rect.top), left: Math.round(rect.left) };
        };
        return {
          name: read('quote-name'),
          phone: read('quote-phone'),
          email: read('quote-email'),
          company: read('quote-company'),
          message: read('quote-message'),
        };
      });

      if (width === 1280) {
        // Name and phone share a row, email and company share the next, and the
        // message spans the full width on a row of its own.
        expect(Math.abs(boxes.name.top - boxes.phone.top)).toBeLessThanOrEqual(
          1
        );
        expect(
          Math.abs(boxes.email.top - boxes.company.top)
        ).toBeLessThanOrEqual(1);
        // The second field of each row really is in a DIFFERENT column from the
        // first. Which physical side that column falls on is the page's
        // direction, not a property of the layout: in RTL the second column is
        // to the LEFT, so asserting a physical left/right here would fail on the
        // Arabic page for a grid that is perfectly correct. Comparing the gap
        // between the two is direction-agnostic and still proves two columns.
        expect(Math.abs(boxes.phone.left - boxes.name.left)).toBeGreaterThan(
          20
        );
        expect(Math.abs(boxes.company.left - boxes.email.left)).toBeGreaterThan(
          20
        );
        // The message sits below both short rows.
        expect(boxes.message.top).toBeGreaterThan(boxes.email.top);
        expect(boxes.message.top).toBeGreaterThan(boxes.name.top);
        // It spans the full width, so it starts at the form's own left edge.
        // Compared in RTL terms — the message's left is compared against the
        // left-most field rather than a specific one, because on the Arabic page
        // the name occupies the RIGHT column and `left` is the column-2 edge.
        const formLeft = await form.evaluate((el) =>
          Math.round(el.getBoundingClientRect().left)
        );
        expect(
          Math.min(boxes.message.left, boxes.name.left, boxes.phone.left)
        ).toBe(formLeft);
      } else {
        // One column: every field starts at the same left edge, and each is
        // below the one before it.
        const lefts = [
          boxes.name.left,
          boxes.phone.left,
          boxes.email.left,
          boxes.company.left,
          boxes.message.left,
        ];
        for (const left of lefts) {
          expect(Math.abs(left - boxes.name.left)).toBeLessThanOrEqual(1);
        }
        expect(boxes.phone.top).toBeGreaterThan(boxes.name.top);
        expect(boxes.email.top).toBeGreaterThan(boxes.phone.top);
        expect(boxes.company.top).toBeGreaterThan(boxes.email.top);
        expect(boxes.message.top).toBeGreaterThan(boxes.company.top);
      }

      // The page never scrolls sideways, whatever the layout.
      const widths = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    });
  }
}

test('a valid submission still posts to the maintenance endpoint and confirms', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${WEB_URL}/en/machines/${MACHINE}`);

  let posted: {
    url: string;
    method: string;
    body: Record<string, unknown>;
  } | null = null;
  page.on('request', (request) => {
    if (request.url().endsWith('/api/maintenance-request')) {
      try {
        posted = {
          url: request.url(),
          method: request.method(),
          body: JSON.parse(request.postData() ?? '{}'),
        };
      } catch {
        posted = null;
      }
    }
  });

  await page.getByLabel('Name', { exact: true }).fill(`Quote Visitor ${STAMP}`);
  await page.getByLabel('Phone', { exact: false }).fill('+201001234567');
  await page.getByLabel('Email (optional)').fill(LEAD_EMAIL);
  await page
    .getByLabel('Message', { exact: false })
    .fill('Please quote this line for 2,000 units per hour.');
  await page.getByRole('button', { name: 'Send quote request' }).click();

  await expect(
    page.getByText('Thank you — your quote request was received.')
  ).toBeVisible();

  // The endpoint, the method and the machine reference are all unchanged: this
  // is the same lead the old side panel produced.
  expect(posted).not.toBeNull();
  expect(posted!.method).toBe('POST');
  expect(posted!.url).toContain('/api/maintenance-request');
  expect(posted!.body.email).toBe(LEAD_EMAIL);
  expect(posted!.body.machineModel).toBe(`Quote Fixture ${STAMP} (${MACHINE})`);
  // The honeypot is still in the payload and still empty.
  expect(posted!.body.website).toBe('');
});

test('a machine with no photo still leads to the form', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`${WEB_URL}/en/machines/${SINGLE}`);

  // No gallery, but the summary block and the button are unaffected: the
  // summary is not placed in a column that only exists when there is a photo.
  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const button = page.getByRole('link', { name: 'Request a quote' });
  await expect(button).toHaveCount(1);
  await expect(button).toHaveAttribute('href', '#quote');
  await expect(page.locator('#quote-heading')).toBeVisible();
});
