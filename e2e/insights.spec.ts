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
import {
  FIXTURE_TAG,
  createSecurityEvents,
  deleteAllSecurityEvents,
  deleteSecurityEventsByTag,
  resetPageViewDaily,
  restoreSecurityEvents,
  runInDb,
  runInDbValue,
  snapshotAllSecurityEvents,
  type SecurityEventFixture,
  type SecurityEventRowSnapshot,
} from './db-fixture';

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
    security: 'Security',
    empty: 'No visits recorded in this period yet.',
    events: 'Recent events',
    topTargets: 'Top targets',
    honeypot: 'Honeypot caught',
    rateLimited: 'Rate limited',
    failedLogins: 'Failed logins',
    allClear: 'All clear',
    allClearDetail: 'No blocked or rejected requests in this period.',
    hintRate: 'A public form sent too many requests.',
    home: 'Home',
    machine: 'Machine — colina-pack-s',
    privacy: 'Privacy',
    machinesSection: 'Machines',
    otherSection: 'Other',
    english: 'English',
    arabic: 'Arabic',
    noPrevious: 'No previous data',
    pagination: 'Pagination',
    nextPage: 'Next',
    updated: /^Updated \d{2}:\d{2}$/,
  },
  ar: {
    traffic: 'زيارات الزوار',
    security: 'الأمان',
    empty: 'لم تُسجَّل أي زيارات في هذه الفترة بعد.',
    events: 'أحدث الأحداث',
    topTargets: 'أكثر الأهداف تكراراً',
    honeypot: 'ضبط حقل الفخ',
    rateLimited: 'تجاوز الحد المسموح',
    failedLogins: 'محاولات دخول فاشلة',
    allClear: 'لا توجد أحداث أمنية',
    allClearDetail: 'لا توجد طلبات محظورة أو مرفوضة في هذه الفترة.',
    hintRate: 'أرسل نموذج عام طلبات أكثر من الحد المسموح.',
    home: 'الرئيسية',
    machine: 'آلة — colina-pack-s',
    privacy: 'الخصوصية',
    machinesSection: 'الآلات',
    otherSection: 'أخرى',
    english: 'الإنجليزية',
    arabic: 'العربية',
    noPrevious: 'لا توجد بيانات للفترة السابقة',
    pagination: 'التنقل بين الصفحات',
    nextPage: 'التالي',
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

function fixtureTimestamp(offset: number, hour = 12, minute = 0): string {
  return `${fixtureDay(offset)}T${String(hour).padStart(2, '0')}:${String(
    minute
  ).padStart(2, '0')}:00.000Z`;
}

type SecuritySeed = Omit<SecurityEventFixture, 'detail'> & {
  detail?: string;
};

/**
 * Security rows are written directly because the exact mix, timestamps and
 * top-target order are the assertion. Every row carries the fixture tag in
 * `detail`, which is the column `deleteSecurityEventsByTag` removes by.
 */
function seedSecurityEvents(rows: SecuritySeed[]) {
  return createSecurityEvents(
    rows.map((row) => ({
      ...row,
      detail: row.detail ?? `${FIXTURE_TAG} security fixture`,
    }))
  );
}

const kpiValue = (page: Page, id: string) => page.getByTestId(`${id}-value`);
const kpiDetail = (page: Page, id: string) => page.getByTestId(`${id}-detail`);
const securityValue = (page: Page, id: string) =>
  page.getByTestId(`insights-security-${id}-value`);
const securityDetail = (page: Page, id: string) =>
  page.getByTestId(`insights-security-${id}-detail`);

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
    await expect(
      page.getByTestId('insights-traffic-chart').locator('tbody tr')
    ).toHaveCount(30);

    await range.getByRole('link', { name: RANGE_LABELS.en[7] }).click();
    await page.waitForURL(/\/en\/insights\?range=7$/);
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('20');
    await expect(
      page.getByTestId('insights-traffic-chart').locator('tbody tr')
    ).toHaveCount(7);
    await expect(
      range.getByRole('link', { name: RANGE_LABELS.en[7] })
    ).toHaveAttribute('aria-current', 'page');

    await range.getByRole('link', { name: RANGE_LABELS.en[90] }).click();
    await page.waitForURL(/\/en\/insights\?range=90$/);
    await expect(kpiValue(page, 'insights-total-views')).toHaveText('102');
    await expect(
      page.getByTestId('insights-traffic-chart').locator('tbody tr')
    ).toHaveCount(90);
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
      // 40 previous views is below the 50-view threshold, so the change is
      // stated as an absolute count rather than a noisy percentage.
      if (locale.id === 'ar') {
        await expect(kpiDetail(page, 'insights-total-views')).toContainText(
          'زيادة'
        );
        await expect(kpiDetail(page, 'insights-total-views')).toContainText(
          '١٠'
        );
        await expect(kpiDetail(page, 'insights-total-views')).toContainText(
          'مشاهدة'
        );
      } else {
        await expect(kpiDetail(page, 'insights-total-views')).toHaveText(
          '↑ Up 10 views vs previous period'
        );
      }
    }

    await context.close();
  });

  test('a huge increase is capped at >999% instead of a noisy percentage', async ({
    browser,
  }) => {
    resetPageViewDaily();
    seedPageViews([
      { dayOffset: -1, path: '/', locale: 'en', count: 1100 },
      { dayOffset: -8, path: '/', locale: 'en', count: 100 },
    ]);

    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/insights?range=7`);
    await expect(kpiDetail(page, 'insights-total-views')).toHaveText(
      '↑ Up >999% vs previous period'
    );

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

      // No traffic chart or ranking is fabricated from zero page views.
      await expect(page.getByTestId('insights-traffic-chart')).toHaveCount(0);
      await expect(page.getByTestId('insights-top-page')).toHaveCount(0);
      await expect(page.getByTestId('insights-sections')).toHaveCount(0);

      // The security half still renders below the traffic section.
      await expect(
        page.getByRole('heading', { name: copy.security })
      ).toBeVisible();
    }

    await context.close();
  });

  test('the chart fills its card with finite geometry at desktop and 390px, in both locales and colour schemes', async ({
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

    // Stage 40b: the SVG must fill the card at both ends of the viewport
    // range, in both locales and in both colour schemes. The viewBox scales,
    // so the rendered width equals the figure's content width and the aspect
    // ratio stays 720:260.
    const viewports = [
      { label: 'desktop', width: 1280, height: 900 },
      { label: '390px', width: 390, height: 844 },
    ] as const;

    for (const viewport of viewports) {
      await page.setViewportSize({
        width: viewport.width,
        height: viewport.height,
      });

      for (const colorScheme of ['light', 'dark'] as const) {
        await page.emulateMedia({ colorScheme });

        for (const locale of LOCALES) {
          const scope = `${locale.id} ${viewport.label} ${colorScheme}`;
          await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);

          const figure = page.getByTestId('insights-traffic-chart');
          await expect(figure).toBeVisible();
          const svg = figure.locator('svg');
          await expect(svg).toHaveAttribute(
            'preserveAspectRatio',
            'xMidYMid meet'
          );
          const svgHtml = await svg.evaluate((element) => element.outerHTML);
          expect(svgHtml, `${scope}: chart has no NaN`).not.toContain('NaN');

          const pathData = await figure
            .locator('path')
            .evaluateAll((elements) =>
              elements.map((element) => element.getAttribute('d') ?? '')
            );
          expect(pathData.length).toBeGreaterThanOrEqual(3);
          for (const data of pathData) {
            expect(data, `${scope}: every path is finite`).not.toContain('NaN');
          }

          await expect(figure.locator('path[stroke-dasharray]')).toHaveCount(1);
          await expect(figure.locator('svg g[tabindex="0"]')).toHaveCount(7);
          await expect(figure.locator('tbody tr')).toHaveCount(7);

          const [figureBox, svgBox] = await Promise.all([
            figure.boundingBox(),
            svg.boundingBox(),
          ]);
          expect(figureBox, `${scope}: figure is rendered`).not.toBeNull();
          expect(svgBox, `${scope}: svg is rendered`).not.toBeNull();
          expect(
            Math.abs(svgBox!.width - figureBox!.width),
            `${scope}: the chart fills the card`
          ).toBeLessThanOrEqual(1);
          expect(
            svgBox!.height / svgBox!.width,
            `${scope}: the viewBox keeps its aspect ratio`
          ).toBeCloseTo(260 / 720, 2);
          if (viewport.label === 'desktop') {
            expect(
              svgBox!.width,
              `${scope}: no 720px cap on a wide card`
            ).toBeGreaterThan(720);
          }

          const overflow = await page.evaluate(() => ({
            scrollWidth: document.documentElement.scrollWidth,
            clientWidth: document.documentElement.clientWidth,
          }));
          expect(
            overflow.scrollWidth,
            `${scope}: the page must not overflow the viewport`
          ).toBeLessThanOrEqual(overflow.clientWidth);
        }
      }
    }

    await context.close();
  });

  test.describe('security section', () => {
    // The test database already holds real security rows (admin sign-ins and
    // previous runs). Snapshot and empty the table once, so every count below
    // is exactly what this section seeds, then put the original rows back.
    let originalRows: SecurityEventRowSnapshot[] = [];

    test.beforeAll(() => {
      deleteSecurityEventsByTag();
      originalRows = snapshotAllSecurityEvents();
      deleteAllSecurityEvents();
    });

    test.afterAll(() => {
      try {
        restoreSecurityEvents(originalRows);
      } finally {
        deleteSecurityEventsByTag();
      }
    });

    test.beforeEach(() => {
      deleteSecurityEventsByTag();
    });

    test('shows exact totals, per-type deltas, top targets and the shared range', async ({
      browser,
    }) => {
      resetPageViewDaily();
      seedPageViews([
        { dayOffset: -1, path: '/', locale: 'en', count: 5 },
        { dayOffset: -8, path: '/', locale: 'en', count: 2 },
        {
          dayOffset: -20,
          path: '/machines/colina-pack-s',
          locale: 'en',
          count: 15,
        },
      ]);
      seedSecurityEvents([
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          ip: '203.0.113.42',
          createdAt: fixtureTimestamp(0, 23),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          createdAt: fixtureTimestamp(0, 22),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          createdAt: fixtureTimestamp(-2, 12),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-3, 12),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          createdAt: fixtureTimestamp(-4, 12),
        },
        {
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(0, 21),
        },
        {
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(-1, 21),
        },
        {
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(-3, 21),
        },
        {
          type: 'HONEYPOT_CAUGHT',
          source: 'maintenance-request',
          createdAt: fixtureTimestamp(-1, 10),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-8, 12),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          createdAt: fixtureTimestamp(-9, 12),
        },
        {
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(-8, 21),
        },
      ]);

      const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();

      for (const locale of LOCALES) {
        const copy = COPY[locale.id];
        const localized = (value: number) =>
          value.toLocaleString(locale.id === 'ar' ? 'ar-EG' : 'en-GB');

        await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);

        // Current: 5 failed logins, 3 rate-limited, 1 honeypot = 9.
        // Previous 7 days: 2 failed logins + 1 rate-limited = 3.
        await expect(securityValue(page, 'total')).toHaveText(localized(9));
        await expect(securityValue(page, 'login-failed')).toHaveText(
          localized(5)
        );
        await expect(securityValue(page, 'rate-limited')).toHaveText(
          localized(3)
        );
        await expect(securityValue(page, 'honeypot-caught')).toHaveText(
          localized(1)
        );

        if (locale.id === 'ar') {
          await expect(securityDetail(page, 'total')).toContainText('زيادة');
          await expect(securityDetail(page, 'total')).toContainText(
            localized(200)
          );
        } else {
          await expect(securityDetail(page, 'total')).toHaveText(
            '↑ Up 200% vs previous period'
          );
          await expect(securityDetail(page, 'rate-limited')).toContainText(
            '↑ Up 200% vs previous period'
          );
          await expect(securityDetail(page, 'login-failed')).toContainText(
            '↑ Up 150% vs previous period'
          );
          await expect(securityDetail(page, 'rate-limited')).toContainText(
            copy.hintRate
          );
        }
        await expect(securityDetail(page, 'honeypot-caught')).toContainText(
          copy.noPrevious
        );

        // A zero-padded column per day, not only the days with events.
        const securityChart = page.getByTestId('insights-security-chart');
        await expect(securityChart).toBeVisible();
        await expect(
          securityChart.getByTestId('insights-security-chart-table')
        ).toBeAttached();
        await expect(securityChart.locator('tbody tr')).toHaveCount(7);

        // Top targets are ordered by count and show a share of the window.
        const targets = page.getByTestId('insights-security-target');
        await expect(targets).toHaveCount(3);
        await expect(targets.nth(0)).toContainText('contact');
        await expect(targets.nth(0)).toContainText(localized(5));
        await expect(targets.nth(0)).toContainText(
          locale.id === 'ar' ? '٥٥٫٦' : '55.6%'
        );
        await expect(targets.nth(1)).toContainText('admin-login');
        await expect(targets.nth(2)).toContainText('maintenance-request');

        const eventTable = page.getByRole('table', { name: copy.events });
        await expect(eventTable.locator('tbody tr')).toHaveCount(9);
        await expect(eventTable.locator('tbody tr').first()).toContainText(
          '203.0.113.x'
        );
        await expect(eventTable.locator('tbody tr').nth(1)).toContainText(
          '2001:db8:85a3…'
        );

        // The one range control is shared: switching it changes the traffic
        // total and the security total together.
        const range = page.getByTestId('insights-range-switch');
        await range
          .getByRole('link', { name: RANGE_LABELS[locale.id][30] })
          .click();
        await page.waitForURL(/\/insights\?range=30$/);
        await expect(kpiValue(page, 'insights-total-views')).toHaveText(
          localized(22)
        );
        await expect(securityValue(page, 'total')).toHaveText(localized(12));
        await expect(securityDetail(page, 'total')).toHaveText(copy.noPrevious);
        await expect(
          page.getByTestId('insights-security-chart').locator('tbody tr')
        ).toHaveCount(30);
      }

      await context.close();
    });

    test('filters and paginates while preserving the range, and never leaks an IP', async ({
      browser,
    }) => {
      const rows: SecuritySeed[] = [
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          ip: '203.0.113.77',
          createdAt: fixtureTimestamp(0, 23, 59),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          ip: '2001:0db8:85a3:0000:0000:8a2e:0370:7334',
          createdAt: fixtureTimestamp(0, 23, 58),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          ip: 'not-an-ip-st28a',
          createdAt: fixtureTimestamp(0, 23, 57),
        },
      ];
      for (let index = 0; index < 22; index += 1) {
        rows.push({
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-1, 12, index % 60),
        });
      }
      for (let index = 0; index < 3; index += 1) {
        rows.push({
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(-2, 12, index),
        });
      }
      seedSecurityEvents(rows);

      const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      const copy = COPY.en;

      await page.goto(`${ADMIN_URL}/en/insights?range=7`);
      await expect(securityValue(page, 'total')).toHaveText('28');
      await expect(securityValue(page, 'login-failed')).toHaveText('25');
      await expect(securityValue(page, 'rate-limited')).toHaveText('3');
      await expect(securityValue(page, 'honeypot-caught')).toHaveText('0');

      const table = page.getByTestId('insights-security-events-table');
      await expect(table.locator('tbody tr')).toHaveCount(20);
      await expect(table.locator('tbody tr').first()).toContainText(
        '203.0.113.x'
      );
      await expect(table.locator('tbody tr').nth(1)).toContainText(
        '2001:db8:85a3…'
      );
      await expect(table.locator('tbody tr').nth(2)).not.toContainText(
        'not-an-ip-st28a'
      );

      // Check the whole document, not just the visible cells: a full address
      // must not have reached the page's props or hidden serialized state.
      const html = await page.content();
      expect(html).toContain('203.0.113.x');
      expect(html).toContain('2001:db8:85a3…');
      expect(html).not.toContain('203.0.113.77');
      expect(html).not.toContain('2001:0db8:85a3:0000:0000:8a2e:0370:7334');
      expect(html).not.toContain('not-an-ip-st28a');

      const filter = page.getByTestId('insights-security-filter');
      await filter.getByRole('link', { name: copy.failedLogins }).click();
      await page.waitForURL(/\/insights\?range=7&type=LOGIN_FAILED$/);
      await expect(
        filter.getByRole('link', { name: copy.failedLogins })
      ).toHaveAttribute('aria-current', 'page');

      const pagination = page.getByRole('navigation', {
        name: copy.pagination,
      });
      await expect(pagination).toContainText('Page 1 of 2');
      await expect(table.locator('tbody tr')).toHaveCount(20);
      await pagination.getByRole('link', { name: copy.nextPage }).click();
      await page.waitForURL(/\/insights\?range=7&type=LOGIN_FAILED&page=2$/);
      await expect(pagination).toContainText('Page 2 of 2');
      await expect(table.locator('tbody tr')).toHaveCount(5);

      // Switching the shared range keeps the filter and starts at page 1.
      await page
        .getByTestId('insights-range-switch')
        .getByRole('link', { name: RANGE_LABELS.en[30] })
        .click();
      await page.waitForURL(/\/insights\?range=30&type=LOGIN_FAILED$/);
      await expect(
        filter.getByRole('link', { name: copy.failedLogins })
      ).toHaveAttribute('aria-current', 'page');
      await expect(pagination).toContainText('Page 1 of 2');

      // "All types" keeps the range and clears both type and page.
      await filter.getByRole('link', { name: 'All types' }).click();
      await page.waitForURL(/\/insights\?range=30$/);
      await expect(securityValue(page, 'total')).toHaveText('28');
      await expect(table.locator('tbody tr')).toHaveCount(20);

      await context.close();
    });

    test('shows a calm All clear state when the range has no events', async ({
      browser,
    }) => {
      const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();

      for (const locale of LOCALES) {
        const copy = COPY[locale.id];
        await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);

        await expect(securityValue(page, 'total')).toHaveText(
          locale.id === 'ar' ? '٠' : '0'
        );
        for (const id of ['login-failed', 'rate-limited', 'honeypot-caught']) {
          await expect(securityValue(page, id)).toHaveText(
            locale.id === 'ar' ? '٠' : '0'
          );
        }

        const allClear = page.getByTestId('insights-security-all-clear');
        await expect(allClear).toBeVisible();
        await expect(allClear).toContainText(copy.allClear);
        await expect(allClear).toContainText(copy.allClearDetail);
        expect(await allClear.innerHTML()).not.toContain('amber');

        await expect(page.getByTestId('insights-security-chart')).toHaveCount(
          0
        );
        await expect(page.getByTestId('insights-security-targets')).toHaveCount(
          0
        );
        await expect(page.getByTestId('insights-security-filter')).toHaveCount(
          0
        );
        await expect(
          page.getByTestId('insights-security-events-table')
        ).toHaveCount(0);
      }

      await context.close();
    });

    test('draws finite geometry and uses cards instead of a table at 390px', async ({
      browser,
    }) => {
      seedSecurityEvents([
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-1, 10),
        },
        {
          type: 'HONEYPOT_CAUGHT',
          source: 'contact',
          createdAt: fixtureTimestamp(-1, 11),
        },
        {
          type: 'RATE_LIMITED',
          source: 'contact',
          createdAt: fixtureTimestamp(-2, 12),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'contact',
          createdAt: fixtureTimestamp(-2, 13),
        },
        {
          type: 'LOGIN_FAILED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-4, 14),
        },
        {
          type: 'RATE_LIMITED',
          source: 'admin-login',
          createdAt: fixtureTimestamp(-4, 15),
        },
      ]);

      const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
      const context = await browser.newContext({ storageState: state });
      const page = await context.newPage();
      await page.setViewportSize({ width: 390, height: 844 });

      for (const locale of LOCALES) {
        await page.goto(`${ADMIN_URL}/${locale.id}/insights?range=7`);

        const chart = page.getByTestId('insights-security-chart');
        await expect(chart).toBeVisible();
        await expect(chart).toHaveAttribute('dir', 'ltr');
        // The legend swatches are small SVGs of their own; the chart itself is
        // the role="img" SVG.
        const svg = chart.locator('svg[role="img"]');
        await expect(svg).toHaveAttribute('aria-label', /.+/);
        const svgHtml = await svg.evaluate((element) => element.outerHTML);
        expect(
          svgHtml,
          `${locale.id}: security chart has no NaN`
        ).not.toContain('NaN');

        const bars = await chart.locator('rect').evaluateAll((elements) =>
          elements.map((element) => ({
            x: Number(element.getAttribute('x')),
            y: Number(element.getAttribute('y')),
            width: Number(element.getAttribute('width')),
            height: Number(element.getAttribute('height')),
          }))
        );
        expect(bars.length, `${locale.id}: stacked bars exist`).toBeGreaterThan(
          0
        );
        for (const bar of bars) {
          expect(Number.isFinite(bar.x)).toBe(true);
          expect(Number.isFinite(bar.y)).toBe(true);
          expect(bar.width).toBeGreaterThan(0);
          expect(bar.height).toBeGreaterThan(0);
        }

        // Stage 40b: hue is not the only distinction. Two series are painted
        // with SVG patterns and the legend repeats the same swatches, so the
        // chart survives greyscale, colour blindness and a printed screenshot.
        await expect(chart.locator('defs pattern')).toHaveCount(2);
        const patternedFills = await chart
          .locator('rect[fill^="url(#"]')
          .evaluateAll((elements) => [
            ...new Set(elements.map((element) => element.getAttribute('fill'))),
          ]);
        expect(
          patternedFills.sort(),
          `${locale.id}: hatched and dotted series`
        ).toEqual([
          'url(#security-honeypot-hatch)',
          'url(#security-login-dots)',
        ]);
        const legendFills = await chart
          .locator('ul svg path[fill^="url(#"]')
          .evaluateAll((elements) => [
            ...new Set(elements.map((element) => element.getAttribute('fill'))),
          ]);
        expect(
          legendFills.sort(),
          `${locale.id}: legend repeats both patterns`
        ).toEqual(patternedFills);
        await expect(
          chart.locator('rect.fill-chart-security-rate')
        ).not.toHaveCount(0);

        await expect(chart.locator('tbody tr')).toHaveCount(7);
        await expect(
          page.getByTestId('insights-security-events-table')
        ).toBeHidden();
        await expect(
          page.getByTestId('insights-security-events-cards')
        ).toBeVisible();
        await expect(
          page.getByTestId('insights-security-events-cards').locator('li')
        ).toHaveCount(6);

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
