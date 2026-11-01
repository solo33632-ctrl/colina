import { expect, test } from '@playwright/test';
import {
  FIXTURE_TAG,
  createAgents,
  deleteAgentsByTag,
  deleteAllAgents,
  restoreAgents,
  snapshotAllAgents,
  type AgentRowSnapshot,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

// Stage 37a: the public agents page.
//
// The Agent model has no name, no website, no logo and no active/published
// flag (reported in Step 0; the stage forbids schema changes), so an agent
// is addressed by its country + city and there are NO website tests here:
// the page renders only tel:/mailto: links, and "untrusted DB text" is
// exercised through the phone/email values instead.
//
// The tag rides inside BOTH country names — the country pair is the only
// identifying text an agent has, and `deleteAgentsByTag` matches on it.
//
// City names are chosen so the alphabetical order after localization is
// unambiguous in BOTH scripts, and in fact SWAPS between the two: Latin
// puts Q before T (Banha, Qena, Tanta) while Arabic puts ط before ق
// (بنها, طنطا, قنا) — the same rows, read in a different visual order.
const FIXTURE_AGENTS = [
  {
    countryEn: `Egypt ${FIXTURE_TAG}`,
    countryAr: `مصر ${FIXTURE_TAG}`,
    cityEn: 'Banha',
    cityAr: 'بنها',
    addressEn: '12 Industrial Zone, Banha',
    addressAr: 'المنطقة الصناعية الأولى، بنها',
    phone: '+20 40 555 0100',
    email: 'banha-agent@example.com',
  },
  {
    countryEn: `Egypt ${FIXTURE_TAG}`,
    countryAr: `مصر ${FIXTURE_TAG}`,
    cityEn: 'Tanta',
    cityAr: 'طنطا',
    // No phone, no email, no address: a contact-less card still renders.
  },
  {
    countryEn: `Egypt ${FIXTURE_TAG}`,
    countryAr: `مصر ${FIXTURE_TAG}`,
    cityEn: 'Qena',
    cityAr: 'قنا',
    addressEn: '', // blank address behaves as absent
    phone: 'not a phone',
    email: 'scheme:payload@example.com',
  },
  {
    countryEn: `Qatar ${FIXTURE_TAG}`,
    countryAr: `قطر ${FIXTURE_TAG}`,
    cityEn: 'Doha',
    cityAr: 'الدوحة',
    phone: '+974 4000 0000',
  },
];

const EN_TAGGED = `Egypt ${FIXTURE_TAG}`;
const QA_TAGGED = `Qatar ${FIXTURE_TAG}`;
// The Arabic page headings carry the localized (Arabic) wording of the
// country pair — the DB pair, read in the page's language.
const QA_TAGGED_AR = `قطر ${FIXTURE_TAG}`;
const EN_TAGGED_AR = `مصر ${FIXTURE_TAG}`;

type SectionListing = { heading: string; cities: string[] };

// One round trip: each country section with its heading and the card titles
// under it. Tagging the filter keeps the assertions independent of the
// seeded agents (seed-agent-cairo, seed-agent-riyadh) the page also shows.
async function countrySections(page: import('@playwright/test').Page) {
  return page.locator('main section').evaluateAll((nodes) =>
    nodes.map((section) => ({
      heading: section.querySelector('h2')?.textContent?.trim() ?? '',
      cities: Array.from(section.querySelectorAll('h3')).map(
        (city) => city.textContent?.trim() ?? ''
      ),
    }))
  );
}

// Fixtures once for the file; deleting the tag first makes a run that
// crashed halfway start clean. workers: 1 keeps every test below serial.
test.beforeAll(() => {
  deleteAgentsByTag();
  createAgents(FIXTURE_AGENTS);
});

test.afterAll(() => {
  deleteAgentsByTag();
});

test.describe('agents page (en)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('groups agents by country and orders them alphabetically', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/agents`);

    const sections = await countrySections(page);
    const tagged = sections.filter((section) =>
      section.heading.includes(FIXTURE_TAG)
    );

    expect(tagged.map((section) => section.heading)).toEqual([
      EN_TAGGED,
      QA_TAGGED,
    ]);
    // Latin order: B < Q < T. (Same rows read in Arabic swap Q and T.)
    expect(tagged[0].cities).toEqual(['Banha', 'Qena', 'Tanta']);
    expect(tagged[1].cities).toEqual(['Doha']);

    // The section heading is the only h2 with the country's name on it, and
    // each card is a list item inside its country section.
    const qatar = page
      .locator('main section')
      .filter({ has: page.locator('h2').filter({ hasText: QA_TAGGED }) });
    await expect(qatar.locator('h3', { hasText: 'Doha' })).toHaveCount(1);
  });

  test('shows the localized values a card carries', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/agents`);

    const banha = page
      .locator('main li')
      .filter({ has: page.locator('h3', { hasText: 'Banha' }) });
    // The address is the stored English text; the phone keeps its stored
    // formatting as the LINK TEXT (the href is asserted next).
    await expect(banha).toContainText('12 Industrial Zone, Banha');
    await expect(banha).toContainText('+20 40 555 0100');

    // A card with no usable contacts still renders — title + nothing else.
    const tanta = page
      .locator('main li')
      .filter({ has: page.locator('h3', { hasText: 'Tanta' }) });
    await expect(tanta).toHaveCount(1);
    await expect(tanta.locator('a')).toHaveCount(0);

    // Heading + subheading from the message files, in the page language.
    await expect(page.locator('main h1')).toHaveText('Our agents');
    await expect(page.locator('main p').first()).toContainText(
      'Find a Colina agent near you'
    );
  });
});

test.describe('agents page (ar)', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('reads right-to-left with the Arabic-first ordering', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/ar/agents`);

    // The layout sets lang and dir on <html>.
    await expect(page.locator('html')).toHaveAttribute('lang', 'ar');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');

    const sections = await countrySections(page);
    const tagged = sections.filter((section) =>
      section.heading.includes(FIXTURE_TAG)
    );

    // Arabic collation: ق comes before م. The headings are the ARABIC
    // labels, because the page reads in Arabic.
    expect(tagged.map((section) => section.heading)).toEqual([
      QA_TAGGED_AR,
      EN_TAGGED_AR,
    ]);
    // Arabic order: ب < ط < ق — where the Latin page had Q before T.
    expect(tagged[1].cities).toEqual(['بنها', 'طنطا', 'قنا']);
    expect(tagged[0].cities).toEqual(['الدوحة']);

    await expect(page.locator('main h1')).toHaveText('وكلاؤنا');
  });

  test('isolates the phone number LTR inside the RTL card', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/ar/agents`);

    const banha = page
      .locator('main li')
      .filter({ has: page.locator('h3', { hasText: 'بنها' }) });
    const phoneLink = banha.locator('a', { hasText: '+20 40 555 0100' });
    await expect(phoneLink).toHaveCount(1);

    const isolate = phoneLink.locator('span[dir="ltr"]');
    await expect(isolate).toHaveCount(1);
    // The isolation is not just an attribute: the resolved direction of the
    // number's span must actually be LTR on an RTL page.
    const direction = await isolate.evaluate(
      (span) => getComputedStyle(span).direction
    );
    expect(direction).toBe('ltr');
    // The class marks the bidi-isolation style shared with contact info.
    expect((await isolate.getAttribute('class')) ?? '').toContain(
      'colina-ltr-isolate'
    );
  });
});

test.describe('contact links', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('tel: and mailto: carry the dialable / addressable values', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/agents`);

    // telHref() keeps only the leading + and the digits: '+20 40 555 0100'
    // must dial as tel:+20405550100 (no spaces, no parentheses).
    await expect(
      page.locator('main a[href="tel:+20405550100"]')
    ).toHaveCount(1);
    // '+974 4000 0000' → tel:+97440000000.
    await expect(
      page.locator('main a[href="tel:+97440000000"]')
    ).toHaveCount(1);
    await expect(
      page.locator('main a[href="mailto:banha-agent@example.com"]')
    ).toHaveCount(1);
  });

  test('an untrusted phone/email renders no link', async ({ page }) => {
    await page.goto(`${WEB_URL}/en/agents`);

    // The Qena row stores 'not a phone' and 'scheme:payload@example.com'.
    // The read-side sanitizers reject both, so the card renders its title
    // and NO contact link at all — a DB value can never become a tel:,
    // mailto: or second-scheme href on this page.
    const qena = page
      .locator('main li')
      .filter({ has: page.locator('h3', { hasText: 'Qena' }) });
    await expect(qena).toHaveCount(1);
    await expect(qena.locator('a[href^="tel:"]')).toHaveCount(0);
    await expect(qena.locator('a[href^="mailto:"]')).toHaveCount(0);
    await expect(qena).not.toContainText('not a phone');
    await expect(qena).not.toContainText('scheme:payload@example.com');

    // Belt and braces across the WHOLE page: no main-level link is external
    // or scheme-suffixed. The Agent model has no website column (reported),
    // so nothing here can produce one, now or after a bad admin edit.
    const hrefs = await page
      .locator('main a')
      .evaluateAll((anchors) => anchors.map((a) => a.getAttribute('href')));
    for (const href of hrefs) {
      expect(href ?? '', `${href} must not be external`).not.toMatch(
        /^(https?:|javascript:|data:|\/\/)/
      );
    }
  });
});

// The seeded agents must survive this test: snapshot EVERY row, empty the
// table, assert, restore — workers: 1 makes the window safe, and the
// restore in `finally` runs even if an assertion fails mid-way.
test.describe('agents page empty state', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('points to the contact page when no agent exists', async ({ page }) => {
    const snapshot = snapshotAllAgents() as AgentRowSnapshot[];
    expect(snapshot.length, 'seeded agents must exist before the test').toBeGreaterThan(
      0
    );

    try {
      deleteAllAgents();

      for (const [locale, empty, cta, contactHref] of [
        [
          'en',
          'No agents are listed yet',
          'Contact us',
          '/en/contact',
        ] as const,
        ['ar', 'لا يوجد وكلاء مدرجون', 'اتصل بنا', '/ar/contact'] as const,
      ]) {
        await page.goto(`${WEB_URL}/${locale}/agents`);

        // No country section is rendered at all — not even an empty one.
        expect(
          await page.locator('main section').count(),
          'empty page renders no country section'
        ).toBe(0);
        await expect(page.locator('main')).toContainText(empty);
        const ctaLink = page
          .locator('main')
          .locator('a', { hasText: cta });
        await expect(ctaLink).toHaveCount(1);
        await expect(ctaLink).toHaveAttribute('href', contactHref);
      }
    } finally {
      restoreAgents(snapshot);
    }
  });

  test('the restored snapshot survives: an agent is on the page again', async ({
    page,
  }) => {
    // Runs after the empty-state test (workers: 1): the restore must have
    // put the seeded rows back, so the page shows sections again.
    await page.goto(`${WEB_URL}/en/agents`);
    expect(
      await page.locator('main section').count(),
      'agents are back after the empty-state restore'
    ).toBeGreaterThan(0);
  });
});

test.describe('agents page navigation', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  for (const locale of ['en', 'ar'] as const) {
    test(`header and footer link to /agents (${locale})`, async ({
      page,
    }) => {
      await page.goto(`${WEB_URL}/${locale}/agents`);

      // The header nav is the desktop-only list (no mobile menu exists —
      // that is Stage 37a scope, deliberately).
      await expect(
        page.locator('header nav').locator(`a[href="/${locale}/agents"]`)
      ).toHaveCount(1);
      await expect(
        page.locator('footer').locator(`a[href="/${locale}/agents"]`)
      ).toHaveCount(1);
    });
  }
});

test.describe('agents page at 390px', () => {
  for (const locale of ['en', 'ar'] as const) {
    test(`no horizontal overflow (${locale})`, async ({ page }) => {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`${WEB_URL}/${locale}/agents`);

      // Same contract the other public pages keep: content may not widen
      // the document at a phone width, in either direction.
      const widths = await page.evaluate(() => ({
        scroll: document.scrollingElement!.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(widths.scroll).toBeLessThanOrEqual(widths.client + 1);
    });
  }
});
