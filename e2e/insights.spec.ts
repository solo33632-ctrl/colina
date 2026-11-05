import { test, expect } from '@playwright/test';
import type { Page } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  LOCALES,
  copyFor,
  loginState,
} from './admin-session';
import {
  DATABASE_URL,
  EDITOR,
  ensureEditor,
  removeEditor,
} from './admin-editor';
import { resetPageViewDaily, runInDb, runInDbValue } from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const DAY_MS = 24 * 60 * 60 * 1000;

const RANGE_LABELS = {
  en: {
    7: 'Last 7 days',
    30: 'Last 30 days',
    90: 'Last 90 days',
  },
  ar: {
    7: 'آخر ٧ أيام',
    30: 'آخر ٣٠ يوماً',
    90: 'آخر ٩٠ يوماً',
  },
} as const;

const COPY = {
  en: {
    traffic: 'Visitor traffic',
    security: 'Blocked and rejected requests',
    empty: 'No visits recorded in this period yet.',
    events: 'Recent events',
    honeypot: 'Honeypot caught',
    home: 'Home',
    machine: 'Machine — colina-pack-s',
    privacy: 'Privacy',
    machinesSection: 'Machines',
    otherSection: 'Other',
    english: 'English',
    arabic: 'Arabic',
    noPrevious: 'No previous data',
    updated: /^Updated \d{2}:\d{2}$/,
  },
  ar: {
    traffic: 'زيارات الزوار',
    security: 'الطلبات المحظورة والمرفوضة',
    empty: 'لم تُسجَّل أي زيارات في هذه الفترة بعد.',
    events: 'أحدث الأحداث',
    honeypot: 'ضبط حقل الفخ',
    home: 'الرئيسية',
    machine: 'آلة — colina-pack-s',
    privacy: 'الخصوصية',
    machinesSection: 'الآلات',
    otherSection: 'أخرى',
    english: 'الإنجليزية',
    arabic: 'العربية',
    noPrevious: 'لا توجد بيانات للفترة السابقة',
    updated: /^آخر تحديث /,
  },
} as const;

// The dashboard's windows are built from the *server's* calendar day, using
// the same local Y/M/D -> UTC-midnight rule as `utcDayKey` in the app. The
// test process and both servers share a timezone in the documented local
// setup, so computing the keys here keeps the fixtures deterministic without
// relying on the database clock.
function fixtureDay(offset: number): string {
  const now = new Date();
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return new Date(today + offset * DAY_MS).toISOString().slice(0, 10);
}

type PageViewSeed = {
  /** 0 is today, -1 yesterday, and so on. */
  dayOffset: number;
  path: string;
  locale: 'ar' | 'en';
  count: number;
};

/**
 * Writes exact daily totals, which is what the range, delta and empty-state
 * cases need. The real beacon writer is exercised separately in the first
 * test, so this fixture only supplies the numbers a SQL aggregate should
 * produce.
 */
function seedPageViews(rows: PageViewSeed[]) {
  const data = rows.map((row) => ({
    date: `${fixtureDay(row.dayOffset)}T00:00:00.000Z`,
    path: row.path,
    locale: row.locale,
    count: row.count,
  }));
  runInDb(`
    const rows = ${JSON.stringify(data)};
    await prisma.pageViewDaily.createMany({
      data: rows.map((row) => ({ ...row, date: new Date(row.date) })),
    });
  `);
}

const kpiValue = (page: Page, id: string) => page.getByTestId(`${id}-value`);
const kpiDetail = (page: Page, id: string) => page.getByTestId(`${id}-detail`);

/**
 * The dashboard ranks page views and security events across whatever is in
 * the window, so this spec empties the page-view table first (other specs
 * visit public pages, and views left over from earlier runs would otherwise
 * out-rank the paths this spec seeds and push them out of the top-ten table).
 *
 * The traffic here still goes through the real beacon: the endpoint, the
 * crawler/origin checks and the upsert are all covered by asserting the row
 * appears, not by inserting it directly. The honeypot is checked before the
 * rate limiter, so this post does not spend the contact endpoint's budget.
 */
async function seedTrafficAndEvents(page: Page) {
  const seededViews: Array<[visitPath: string, recordedPath: string]> = [
    ['/en', '/'],
    ['/en/machines/colina-pack-s', '/machines/colina-pack-s'],
    ['/en/privacy', '/privacy'],
  ];
  for (const [visitPath, recordedPath] of seededViews) {
    await page.goto(`${WEB_URL}${visitPath}`);
    await expect
      .poll(() => countPageViews(recordedPath), {
        timeout: 10_000,
        interval: 300,
      })
      .toBeGreaterThan(0);
  }

  const response = await page.request.post(`${WEB_URL}/api/contact`, {
    headers: { origin: WEB_URL },
    data: {
      name: 'Insights Fixture',
      email: 'fixture@example.com',
      phone: '+201000000000',
      message: 'A message long enough to pass validation, never stored.',
      // The hidden field: a filled trap means a bot, and the endpoint records
      // HONEYPOT_CAUGHT instead of the message.
      website: 'spam-fixture',
    },
  });
  expect(
    response.status(),
    'honeypot POST is accepted as if from a person'
  ).toBe(200);
}

function countPageViews(path: string): number {
  return (
    runInDbValue<number>(
      `return prisma.pageViewDaily.aggregate({
        where: { path: ${JSON.stringify(path)} },
        _sum: { count: true },
      }).then((result) => result._sum.count ?? 0);`
    ) ?? 0
  );
}

test.describe('insights dashboard', () => {
  // A session cookie is not locale-scoped, so each role signs in once and is
  // then exercised under both locale prefixes, rather than spending the login
  // rate limit (10 attempts per 15 minutes) on the suite itself.
  const en = copyFor('en');

  test('a super admin sees the seeded traffic, its labels, and the security section', async ({
    browser,
  }) => {
    // With one worker this reset cannot race another spec's visitors, and
    // after-run leftovers have nowhere to matter: only this spec reads the
    // ranking side.
    resetPageViewDaily();
    const publicContext = await browser.newContext();
    const publicPage = await publicContext.newPage();
    await seedTrafficAndEvents(publicPage);
    await publicContext.close();

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      const copy = COPY[locale.id];
      await page.goto(`${ADMIN_URL}/${locale.id}/insights`);
      await expect(
        page.getByTestId('insights-range-switch').getByRole('link', {
          name: RANGE_LABELS[locale.id][30],
        })
      ).toHaveAttribute('aria-current', 'page');
      await expect(page.getByText(copy.updated)).toBeVisible();

      // Three real page views, one per seeded route, with no previous window.
      await expect(kpiValue(page, 'insights-total-views')).toHaveText(
        locale.id === 'ar' ? '٣' : '3'
      );
      await expect(kpiDetail(page, 'insights-total-views')).toHaveText(
        copy.noPrevious
      );

      const pages = page.getByTestId('insights-top-page');
      await expect(pages).toHaveCount(3);

      // Friendly label, the stored path and a share: all three are required,
      // because the label is a reading aid and the path is the address the
      // operator may need to match.
      await expect(pages.nth(0)).toContainText(copy.home);
      await expect(pages.nth(0).getByText('/', { exact: true })).toBeVisible();
      await expect(pages.nth(0)).toContainText(
        locale.id === 'ar' ? '٣٣٫٣' : '33.3%'
      );

      await expect(pages.nth(1)).toContainText(copy.machine);
      await expect(
        pages.nth(1).getByText('/machines/colina-pack-s', { exact: true })
      ).toBeVisible();

      await expect(pages.nth(2)).toContainText(copy.privacy);
      await expect(
        pages.nth(2).getByText('/privacy', { exact: true })
      ).toBeVisible();

      const sections = page.getByTestId('insights-sections');
      await expect(sections).toContainText(copy.home);
      await expect(sections).toContainText(copy.machinesSection);
      await expect(sections).toContainText(copy.otherSection);

      const localeSplit = page.getByTestId('insights-locale-split-chart');
      await expect(localeSplit).toContainText(copy.english);
      await expect(localeSplit).toContainText(copy.arabic);
      await expect(localeSplit).toContainText(
        locale.id === 'ar' ? '١٠٠' : '100'
      );

      // The security section is still below the traffic it shares a range
      // with, and the honeypot post is still a real table row.
      const trafficHeading = page.getByRole('heading', { name: copy.traffic });
      const securityHeading = page.getByRole('heading', {
        name: copy.security,
      });
      await expect(trafficHeading).toBeVisible();
      await expect(securityHeading).toBeVisible();
      const [trafficBox, securityBox] = await Promise.all([
        trafficHeading.boundingBox(),
        securityHeading.boundingBox(),
      ]);
      expect(
        securityBox!.y,
        `${locale.id}: security section stays below traffic`
      ).toBeGreaterThan(trafficBox!.y);

      // The table is shared with earlier specs' events, so it is not reset;
      // the seeded honeypot is the newest row and must lead it.
      const eventTable = page.getByRole('table', { name: copy.events });
      await expect(eventTable.locator('tbody tr').first()).toContainText(
        copy.honeypot
      );
    }

    await context.close();
  });

  test('the range switch changes the totals and the chart without a reload', async ({
    browser,
  }) => {
    resetPageViewDaily();
    seedPageViews([
      { dayOffset: -1, path: '/', locale: 'en', count: 10 },
      {
        dayOffset: -2,
        path: '/machines/colina-pack-s',
        locale: 'ar',
        count: 10,
      },
      {
        dayOffset: -8,
        path: '/categories/production-lines',
        locale: 'en',
        count: 30,
      },
      { dayOffset: -20, path: '/maintenance', locale: 'ar', count: 5 },
      { dayOffset: -31, path: '/contact', locale: 'en', count: 40 },
      { dayOffset: -60, path: '/about', locale: 'ar', count: 7 },
    ]);

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/insights`);
    const range = page.getByTestId('insights-range-switch');
    await expect(
      range.getByRole('link', { name: RANGE_LABELS.en[30] })
    ).toHaveAttribute('aria-current', 'page');
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('55');
    await expect(page.locator('figure table tbody tr')).toHaveCount(30);

    await range.getByRole('link', { name: RANGE_LABELS.en[7] }).click();
    await page.waitForURL(/\/en\/insights\?range=7$/);
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('20');
    await expect(page.locator('figure table tbody tr')).toHaveCount(7);
    await expect(
      range.getByRole('link', { name: RANGE_LABELS.en[7] })
    ).toHaveAttribute('aria-current', 'page');

    await range.getByRole('link', { name: RANGE_LABELS.en[90] }).click();
    await page.waitForURL(/\/en\/insights\?range=90$/);
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('102');
    await expect(page.locator('figure table tbody tr')).toHaveCount(90);
    await expect(
      range.getByRole('link', { name: RANGE_LABELS.en[90] })
    ).toHaveAttribute('aria-current', 'page');

    // Anything else is not a range: fall back to the 30-day default rather
    // than showing an empty or partial window.
    await page.goto(`${ADMIN_URL}/en/insights?range=14`);
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('55');
    await expect(
      range.getByRole('link', { name: RANGE_LABELS.en[30] })
    ).toHaveAttribute('aria-current', 'page');

    await context.close();
  });

  test('the change against the previous period is stated in words', async ({
    browser,
  }) => {
    resetPageViewDaily();
    seedPageViews([
      { dayOffset: -1, path: '/', locale: 'en', count: 30 },
      {
        dayOffset: -2,
        path: '/machines/colina-pack-s',
        locale: 'en',
        count: 20,
      },
      { dayOffset: -8, path: '/', locale: 'en', count: 25 },
      {
        dayOffset: -9,
        path: '/machines/colina-pack-s',
        locale: 'en',
        count: 15,
      },
    ]);

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);
      await expect(kpiValue(page, 'insights-total-views')).toHaveText(
        locale.id === 'ar' ? '٥٠' : '50'
      );
      if (locale.id === 'ar') {
        await expect(kpiDetail(page, 'insights-total-views')).toContainText(
          'زيادة'
        );
        await expect(kpiDetail(page, 'insights-total-views')).toContainText(
          '٢٥'
        );
      } else {
        await expect(kpiDetail(page, 'insights-total-views')).toHaveText(
          '↑ Up 25% vs previous period'
        );
      }
    }

    await context.close();
  });

  test('an empty previous period says so instead of inventing a percentage', async ({
    browser,
  }) => {
    resetPageViewDaily();
    seedPageViews([{ dayOffset: -1, path: '/', locale: 'en', count: 12 }]);

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      const copy = COPY[locale.id];
      await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);
      await expect(kpiValue(page, 'insights-total-views')).toHaveText(
        locale.id === 'ar' ? '١٢' : '12'
      );
      await expect(kpiDetail(page, 'insights-total-views')).toHaveText(
        copy.noPrevious
      );
      await expect(kpiDetail(page, 'insights-total-views')).not.toContainText(
        '%'
      );
    }

    await context.close();
  });

  test('an empty window keeps the KPIs and shows one friendly empty state', async ({
    browser,
  }) => {
    resetPageViewDaily();

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    for (const locale of LOCALES) {
      const copy = COPY[locale.id];
      await page.goto(`${ADMIN_URL}/${locale.id}/insights`);

      await expect(kpiValue(page, 'insights-total-views')).toHaveText(
        locale.id === 'ar' ? '٠' : '0'
      );
      await expect(page.getByText(copy.empty)).toBeVisible();

      // No chart or ranking is fabricated from zero rows.
      await expect(page.locator('figure')).toHaveCount(0);
      await expect(page.getByTestId('insights-top-page')).toHaveCount(0);
      await expect(page.getByTestId('insights-sections')).toHaveCount(0);

      // The security half still renders below the traffic section.
      await expect(
        page.getByRole('heading', { name: copy.security })
      ).toBeVisible();
    }

    await context.close();
  });

  test('the chart draws only finite geometry at 390px, in both locales', async ({
    browser,
  }) => {
    resetPageViewDaily();
    seedPageViews([
      // Current 7-day window: four non-zero days, so the series has gaps.
      { dayOffset: -1, path: '/', locale: 'en', count: 3 },
      { dayOffset: -2, path: '/', locale: 'en', count: 7 },
      { dayOffset: -3, path: '/', locale: 'en', count: 2 },
      { dayOffset: -4, path: '/', locale: 'en', count: 9 },
      // Previous 7-day window: the dashed overlay must have real points.
      { dayOffset: -8, path: '/', locale: 'en', count: 1 },
      { dayOffset: -9, path: '/', locale: 'en', count: 5 },
      { dayOffset: -11, path: '/', locale: 'en', count: 6 },
      { dayOffset: -13, path: '/', locale: 'en', count: 2 },
    ]);

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();
    await page.setViewportSize({ width: 390, height: 844 });

    for (const locale of LOCALES) {
      await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);

      const figure = page.locator('figure');
      await expect(figure).toBeVisible();
      const svg = figure.locator('svg');
      const svgHtml = await svg.evaluate((element) => element.outerHTML);
      expect(svgHtml, `${locale.id}: chart has no NaN`).not.toContain('NaN');

      const pathData = await figure
        .locator('path')
        .evaluateAll((elements) =>
          elements.map((element) => element.getAttribute('d') ?? '')
        );
      expect(pathData.length).toBeGreaterThanOrEqual(3);
      for (const data of pathData) {
        expect(data, `${locale.id}: every path is finite`).not.toContain('NaN');
      }

      await expect(figure.locator('path[stroke-dasharray]')).toHaveCount(1);
      await expect(figure.locator('svg g[tabindex="0"]')).toHaveCount(7);
      await expect(figure.locator('tbody tr')).toHaveCount(7);

      const overflow = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(
        overflow.scrollWidth,
        `${locale.id}: the page must not overflow a 390px viewport`
      ).toBeLessThanOrEqual(overflow.clientWidth);
    }

    await context.close();
  });

  test('an editor is refused and never sees the link', async ({ browser }) => {
    test.skip(!DATABASE_URL, 'DATABASE_URL is required to create the editor');
    test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');
    ensureEditor();
    try {
      const state = await loginState(
        browser,
        en,
        EDITOR.email,
        EDITOR.password
      );
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();

      for (const locale of LOCALES) {
        const copy = COPY[locale.id];

        // Hidden in the nav...
        await page.goto(`${ADMIN_URL}/${locale.id}`);
        const nav = await page.locator('aside nav').first().textContent();
        const label = locale.id === 'ar' ? 'رؤى' : 'Insights';
        expect(
          nav,
          `/${locale.id}: insights link hidden for an editor`
        ).not.toContain(label);

        // ...and a direct request gets the explanatory card, not the data.
        const res = await page.goto(`${ADMIN_URL}/${locale.id}/insights`);
        expect(res?.status(), `/${locale.id}/insights`).toBe(200);
        await expect(page.getByText(locale.denied)).toBeVisible();
        await expect(
          page.getByRole('heading', { name: copy.traffic })
        ).toHaveCount(0);
        await expect(page.getByTestId('insights-total-views')).toHaveCount(0);
        await expect(page.getByTestId('insights-range-switch')).toHaveCount(0);
      }

      await context.close();
    } finally {
      removeEditor();
    }
  });
});
