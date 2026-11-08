import { test, expect } from '@playwright/test';
import type { Browser, BrowserContext } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

// Stage 40a: the admin's three-mode theme switch and the dark palette behind
// it. The assertions are deliberately about rendered colour, not class names:
// the whole point of the semantic layer is that components keep their old
// Tailwind classes while the variables underneath switch.
//
// Sessions go through the shared helper (one sign-in per run), and each test
// asks for the colour scheme it needs on a fresh context so nothing leaks
// between cases.
const en = copyFor('en');

const DARK_PAGE = 'rgb(15, 15, 18)';
const LIGHT_PAGE = 'rgb(249, 249, 250)';

async function session(browser: Browser) {
  return loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
}

async function signedIn(
  browser: Browser,
  options: {
    colorScheme?: 'light' | 'dark';
    viewport?: { width: number; height: number };
  } = {}
): Promise<BrowserContext> {
  return browser.newContext({
    storageState: await session(browser),
    colorScheme: options.colorScheme ?? 'light',
    viewport: options.viewport,
  });
}

async function darkContext(
  browser: Browser,
  options: {
    colorScheme?: 'light' | 'dark';
    viewport?: { width: number; height: number };
  } = {}
): Promise<BrowserContext> {
  const context = await signedIn(browser, options);
  await context.addCookies([
    { name: 'admin-theme', value: 'dark', url: ADMIN_URL },
  ]);
  return context;
}

async function bodyBackground(page: import('@playwright/test').Page) {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

async function htmlTheme(page: import('@playwright/test').Page) {
  return page.evaluate(() =>
    document.documentElement.getAttribute('data-theme')
  );
}

async function themeCookie(context: BrowserContext) {
  return (await context.cookies()).find(
    (cookie) => cookie.name === 'admin-theme'
  );
}

type ContrastSample = {
  name: string;
  text: string;
  color: string;
  background: string;
  ratio: number;
};

// Runs inside the page. Every sampled element either has its own opaque
// background (buttons, inputs, badges) or sits on the nearest ancestor that
// does (cards, table cells, the page), so walking up to the first opaque
// background gets the actual backdrop without needing screenshot pixels.
function collectContrastSamples(
  selectors: Record<string, string>
): ContrastSample[] {
  const parse = (value: string): [number, number, number, number] => {
    const match = value.match(/rgba?\(([^)]+)\)/);
    if (!match) {
      return [0, 0, 0, 1];
    }
    const parts = match[1]
      .split(/[\s,/]+/)
      .filter(Boolean)
      .map((part) => Number(part));
    return [parts[0], parts[1], parts[2], parts[3] ?? 1];
  };

  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.04045
      ? scaled / 12.92
      : ((scaled + 0.055) / 1.055) ** 2.4;
  };

  const luminance = (color: number[]) =>
    0.2126 * channel(color[0]) +
    0.7152 * channel(color[1]) +
    0.0722 * channel(color[2]);

  const backgroundOf = (element: Element): [number, number, number, number] => {
    let node: Element | null = element;
    while (node) {
      const color = parse(getComputedStyle(node).backgroundColor);
      if (color[3] >= 1) {
        return color;
      }
      node = node.parentElement;
    }
    return [255, 255, 255, 1];
  };

  const ratio = (foreground: number[], background: number[]) => {
    const first = luminance(foreground);
    const second = luminance(background);
    return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
  };

  const isVisible = (element: Element) => {
    if (element.closest('.sr-only')) {
      return false;
    }
    const rect = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      Number(style.opacity) > 0
    );
  };

  const samples: ContrastSample[] = [];
  for (const [name, selector] of Object.entries(selectors)) {
    const element = Array.from(document.querySelectorAll(selector)).find(
      isVisible
    );
    if (!element) {
      continue;
    }
    const background = backgroundOf(element);
    const color = parse(getComputedStyle(element).color);
    const text = (element.textContent ?? '').trim().slice(0, 60);
    samples.push({
      name,
      text,
      color: `rgb(${color.slice(0, 3).join(', ')})`,
      background: `rgb(${background.slice(0, 3).join(', ')})`,
      ratio: ratio(color, background),
    });

    if (name === 'input') {
      // The first visible input may be an unlabelled slug with no hint; scan
      // for the first input that actually has placeholder text so the
      // placeholder contrast is exercised wherever one is rendered.
      const withPlaceholder = Array.from(
        document.querySelectorAll<HTMLInputElement>(selector)
      ).find(
        (candidate) => isVisible(candidate) && candidate.placeholder.length > 0
      );
      if (withPlaceholder) {
        const placeholderColor = parse(
          getComputedStyle(withPlaceholder, '::placeholder').color
        );
        const placeholderBackground = backgroundOf(withPlaceholder);
        samples.push({
          name: 'placeholder',
          text: withPlaceholder.placeholder.slice(0, 60),
          color: `rgb(${placeholderColor.slice(0, 3).join(', ')})`,
          background: `rgb(${placeholderBackground.slice(0, 3).join(', ')})`,
          ratio: ratio(placeholderColor, placeholderBackground),
        });
      }
    }
  }
  return samples;
}

// Any element that still paints a literal white box in dark mode is a missed
// surface. Artwork plates (`data-plate`) are intentional: the logo PNG and
// partner/agent wordmarks are dark artwork and need a constant light plate.
function whiteBackgrounds(): string[] {
  const offenders: string[] = [];
  for (const element of Array.from(document.querySelectorAll('*'))) {
    if (element.closest('[data-plate]')) {
      continue;
    }
    if (getComputedStyle(element).backgroundColor === 'rgb(255, 255, 255)') {
      const className =
        typeof element.className === 'string' ? element.className : '';
      offenders.push(`${element.tagName}.${className}`.slice(0, 120));
    }
  }
  return offenders;
}

const PAGE_SELECTORS = {
  heading: 'main h1',
  body: 'main p',
  muted: 'main .text-stone-500',
  tableCell: 'main table tbody td',
  badge: 'main .rounded-full.border',
  button: 'main button',
  input: 'main input:not([type="hidden"]):not([type="file"])',
  select: 'main select',
};

test.describe('admin dark mode', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test('the OS dark preference applies when no cookie is stored', async ({
    browser,
  }) => {
    const context = await signedIn(browser, { colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en`);

    expect(await themeCookie(context)).toBeUndefined();
    expect(await htmlTheme(page)).toBeNull();
    expect(await bodyBackground(page)).toBe(DARK_PAGE);

    const [sample] = await page.evaluate(collectContrastSamples, {
      body: 'body',
    });
    expect(sample.ratio).toBeGreaterThanOrEqual(4.5);
    await context.close();
  });

  test('the OS light preference applies when no cookie is stored', async ({
    browser,
  }) => {
    const context = await signedIn(browser, { colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en`);

    expect(await themeCookie(context)).toBeUndefined();
    expect(await htmlTheme(page)).toBeNull();
    expect(await bodyBackground(page)).toBe(LIGHT_PAGE);
    await context.close();
  });

  test('choosing dark updates immediately, stores the cookie and survives reload', async ({
    browser,
  }) => {
    const context = await signedIn(browser, { colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en`);
    expect(await bodyBackground(page)).toBe(LIGHT_PAGE);

    await page.getByTestId('theme-dark').click();
    await expect.poll(() => htmlTheme(page)).toBe('dark');
    await expect.poll(() => bodyBackground(page)).toBe(DARK_PAGE);

    const cookie = await themeCookie(context);
    expect(cookie).toBeTruthy();
    expect(cookie?.value).toBe('dark');
    expect(cookie?.path).toBe('/');
    expect(cookie?.sameSite).toBe('Lax');
    expect(cookie?.httpOnly).toBe(false);
    expect(cookie?.secure).toBe(false);
    expect(cookie?.expires).toBeGreaterThan(
      Date.now() / 1000 + 300 * 24 * 60 * 60
    );

    // The server-rendered response must already carry the attribute: this is
    // the no-flash guarantee. A client-side effect fixing the page after
    // hydration would leave the raw HTML light here.
    const response = await page.reload();
    expect(response).not.toBeNull();
    const html = (await response?.text()) ?? '';
    expect(html).toMatch(/<html[^>]*data-theme="dark"/);
    expect(await bodyBackground(page)).toBe(DARK_PAGE);
    await context.close();
  });

  test('light overrides a dark OS and system removes the cookie and follows the OS', async ({
    browser,
  }) => {
    const context = await darkContext(browser, { colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en`);
    expect(await bodyBackground(page)).toBe(DARK_PAGE);

    await page.getByTestId('theme-light').click();
    await expect.poll(() => htmlTheme(page)).toBe('light');
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_PAGE);
    expect((await themeCookie(context))?.value).toBe('light');

    await page.getByTestId('theme-system').click();
    await expect.poll(() => htmlTheme(page)).toBeNull();
    await expect.poll(() => themeCookie(context)).toBeUndefined();
    expect(await bodyBackground(page)).toBe(DARK_PAGE);

    await page.emulateMedia({ colorScheme: 'light' });
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_PAGE);

    await page.emulateMedia({ colorScheme: 'dark' });
    await expect.poll(() => bodyBackground(page)).toBe(DARK_PAGE);
    await context.close();
  });

  test('key pages keep readable text and no white surfaces in dark mode', async ({
    browser,
  }) => {
    // Explicit cookie plus an emulated light OS proves the attribute path is
    // doing the work, not the media query.
    const context = await darkContext(browser, { colorScheme: 'light' });
    const page = await context.newPage();

    const pages = [
      ['dashboard', '/en'],
      ['categories list', '/en/categories'],
      ['machines list', '/en/machines'],
      ['machine form', '/en/machines/new'],
      ['partners list', '/en/partners'],
      ['news list', '/en/news'],
      ['services list', '/en/services'],
      ['maintenance categories', '/en/maintenance-categories'],
      ['maintenance showcase', '/en/maintenance-showcase'],
      ['leads list', '/en/leads'],
      ['agents list', '/en/agents'],
      ['audit log', '/en/audit-log'],
      ['insights', '/en/insights'],
      ['settings', '/en/settings'],
    ] as const;

    for (const [label, path] of pages) {
      await page.goto(`${ADMIN_URL}${path}`);
      expect(await htmlTheme(page), label).toBe('dark');
      expect(await bodyBackground(page), label).toBe(DARK_PAGE);

      const samples = await page.evaluate(
        collectContrastSamples,
        PAGE_SELECTORS
      );
      expect(samples.length, `${label}: samples`).toBeGreaterThanOrEqual(3);

      for (const sample of samples) {
        const minimum = sample.name === 'placeholder' ? 3 : 4.5;
        expect(
          sample.ratio,
          `${label} ${sample.name} "${sample.text}" ${sample.color} on ${sample.background}`
        ).toBeGreaterThanOrEqual(minimum);
      }

      const offenders = await page.evaluate(whiteBackgrounds);
      expect(offenders, `${label}: white backgrounds`).toEqual([]);
    }
    await context.close();
  });

  test('en and ar stay within 390px with the toggle visible', async ({
    browser,
  }) => {
    const context = await darkContext(browser, {
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();

    for (const locale of ['en', 'ar'] as const) {
      await page.goto(`${ADMIN_URL}/${locale}`);
      await expect(page.getByTestId('theme-toggle')).toBeVisible();
      await expect(page.locator('html')).toHaveAttribute(
        'dir',
        locale === 'ar' ? 'rtl' : 'ltr'
      );
      const widths = await page.evaluate(() => ({
        scroll: document.documentElement.scrollWidth,
        client: document.documentElement.clientWidth,
      }));
      expect(
        widths.scroll,
        `${locale} horizontal overflow`
      ).toBeLessThanOrEqual(widths.client + 1);
    }
    await context.close();
  });

  test('the login page renders dark', async ({ browser }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/login`);

    expect(await htmlTheme(page)).toBeNull();
    expect(await bodyBackground(page)).toBe(DARK_PAGE);
    await expect(page.getByTestId('theme-toggle')).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Admin login' })
    ).toBeVisible();

    const samples = await page.evaluate(collectContrastSamples, {
      heading: 'h1',
      label: 'label',
      input: '#login-email',
    });
    for (const sample of samples) {
      const minimum = sample.name === 'input' ? 3 : 4.5;
      expect(
        sample.ratio,
        `login ${sample.name} "${sample.text}"`
      ).toBeGreaterThanOrEqual(minimum);
    }

    const offenders = await page.evaluate(whiteBackgrounds);
    expect(offenders).toEqual([]);
    await context.close();
  });

  // Stage 40b: the unauthenticated screens share the auth header and the same
  // Card/Field/Button primitives, but they never render the admin shell — so
  // they get their own dark check rather than relying on the signed-in loop.
  test('forgot and reset password render dark and readable', async ({
    browser,
  }) => {
    const context = await browser.newContext({ colorScheme: 'dark' });
    const page = await context.newPage();

    const pages = [
      ['forgot password', '/en/forgot-password'],
      ['reset password', '/en/reset-password?token=stage-40b-test-token'],
    ] as const;

    for (const [label, path] of pages) {
      await page.goto(`${ADMIN_URL}${path}`);
      expect(await bodyBackground(page), label).toBe(DARK_PAGE);
      await expect(page.getByTestId('theme-toggle')).toBeVisible();

      const samples = await page.evaluate(collectContrastSamples, {
        heading: 'main h2',
        label: 'main label',
        input: 'main input:not([type="hidden"])',
        button: 'main button',
      });
      expect(samples.length, `${label}: samples`).toBeGreaterThanOrEqual(3);
      for (const sample of samples) {
        expect(
          sample.ratio,
          `${label} ${sample.name} "${sample.text}" ${sample.color} on ${sample.background}`
        ).toBeGreaterThanOrEqual(4.5);
      }

      const offenders = await page.evaluate(whiteBackgrounds);
      expect(offenders, `${label}: white backgrounds`).toEqual([]);
    }

    await context.close();
  });

  // Stage 40b: the drawer is the whole navigation at 390px. It must open over
  // the dark page, keep its links readable and never widen the document.
  test('the mobile drawer opens readable at 390px in dark mode', async ({
    browser,
  }) => {
    const context = await darkContext(browser, {
      colorScheme: 'dark',
      viewport: { width: 390, height: 844 },
    });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en`);

    const trigger = page.getByRole('button', {
      name: 'Open navigation menu',
      exact: true,
    });
    const drawer = page.locator('#admin-sidebar-drawer');
    await expect(drawer).toHaveJSProperty('inert', true);

    await trigger.click();
    await expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await expect(drawer).toHaveJSProperty('inert', false);
    await expect(
      drawer.getByRole('link', { name: 'Dashboard', exact: true })
    ).toBeVisible();

    const widths = await page.evaluate(() => ({
      scroll: document.documentElement.scrollWidth,
      client: document.documentElement.clientWidth,
    }));
    expect(
      widths.scroll,
      'open drawer horizontal overflow'
    ).toBeLessThanOrEqual(widths.client + 1);

    const samples = await page.evaluate(collectContrastSamples, {
      active: '#admin-sidebar-drawer a[aria-current="page"]',
      group: '#admin-sidebar-drawer p',
      close: '#admin-sidebar-drawer button',
    });
    expect(samples.length, 'drawer samples').toBeGreaterThanOrEqual(3);
    for (const sample of samples) {
      expect(
        sample.ratio,
        `drawer ${sample.name} "${sample.text}" ${sample.color} on ${sample.background}`
      ).toBeGreaterThanOrEqual(4.5);
    }

    const offenders = await page.evaluate(whiteBackgrounds);
    expect(offenders, 'drawer: white backgrounds').toEqual([]);

    await page.keyboard.press('Escape');
    await expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await expect(drawer).toHaveJSProperty('inert', true);
    await context.close();
  });

  // Stage 40b: the remaining reviewed surfaces — the save banner, the delete
  // confirmation, native checkboxes and the constant-white artwork plate.
  test('save banner, confirm dialog and native controls stay readable in dark mode', async ({
    browser,
  }) => {
    const context = await darkContext(browser, { colorScheme: 'dark' });
    const page = await context.newPage();

    // Native checkboxes: the lead list's light-mode accent is unchanged, but
    // the dark theme swaps in the darker control accent.
    await page.goto(`${ADMIN_URL}/en/leads`);
    // The leads page renders a desktop table and a mobile card list; only one
    // of the two select-all checkboxes is visible at this viewport.
    const checkbox = page
      .locator('main input[type="checkbox"]:visible')
      .first();
    await expect(checkbox).toBeVisible();
    expect(
      await checkbox.evaluate(
        (element) => getComputedStyle(element).accentColor
      )
    ).toBe('rgb(205, 63, 23)');

    // The artwork plate stays white in both themes, so its fallback letter
    // must stay dark instead of following the light dark-mode brand scale.
    const plate = await page.evaluate(() => {
      const probe = document.createElement('span');
      probe.className = 'bg-plate text-plate-ink';
      probe.textContent = 'A';
      document.body.appendChild(probe);
      const style = getComputedStyle(probe);
      const result = { color: style.color, background: style.backgroundColor };
      probe.remove();
      return result;
    });
    expect(plate).toEqual({
      color: 'rgb(143, 30, 22)',
      background: 'rgb(255, 255, 255)',
    });

    // The ?saved=1 banner is a status surface with its own tinted palette.
    await page.goto(`${ADMIN_URL}/en/partners?saved=1`);
    const banner = page.getByRole('status');
    await expect(banner).toBeVisible();
    const bannerSamples = await page.evaluate(collectContrastSamples, {
      message: '[role="status"] p',
      dismiss: '[role="status"] button',
    });
    expect(bannerSamples.length, 'banner samples').toBeGreaterThanOrEqual(2);
    for (const sample of bannerSamples) {
      expect(
        sample.ratio,
        `banner ${sample.name} "${sample.text}" ${sample.color} on ${sample.background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(await page.evaluate(whiteBackgrounds), 'banner: white').toEqual([]);

    // Opening the delete dialog must not paint a white box or unreadable text.
    await page.locator('main button[aria-label^="Delete"]').first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    const dialogSamples = await page.evaluate(collectContrastSamples, {
      heading: 'dialog h2',
      message: 'dialog p',
      cancel: 'dialog button',
    });
    expect(dialogSamples.length, 'dialog samples').toBeGreaterThanOrEqual(3);
    for (const sample of dialogSamples) {
      expect(
        sample.ratio,
        `dialog ${sample.name} "${sample.text}" ${sample.color} on ${sample.background}`
      ).toBeGreaterThanOrEqual(4.5);
    }
    expect(await page.evaluate(whiteBackgrounds), 'dialog: white').toEqual([]);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    await context.close();
  });

  test('light mode keeps the original checkbox accent', async ({ browser }) => {
    const context = await signedIn(browser, { colorScheme: 'light' });
    const page = await context.newPage();
    await page.goto(`${ADMIN_URL}/en/leads`);

    const checkbox = page
      .locator('main input[type="checkbox"]:visible')
      .first();
    await expect(checkbox).toBeVisible();
    expect(
      await checkbox.evaluate(
        (element) => getComputedStyle(element).accentColor
      )
    ).toBe('rgb(178, 39, 21)');
    await context.close();
  });
});
