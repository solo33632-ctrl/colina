import { expect, type Locator, type Page } from '@playwright/test';

/**
 * Waits until React has hydrated the current document.
 *
 * Next.js serves the form markup before the client bundle runs. A `fill()` or
 * a click in that window hits the plain DOM: the value is written, then
 * hydration reconciles the input back to its server-rendered value (empty),
 * and a client-only button's click is simply lost. React attaches its fiber
 * bookkeeping to every server-rendered element during hydration, so waiting
 * for that property on a form control is a direct signal that the window has
 * passed. No fixed timeout and no arbitrary sleep.
 *
 * Only call this on pages that render a form; it waits for a form control.
 */
export async function waitForHydration(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const control = document.querySelector(
      'form input, form textarea, form select, form button'
    );
    if (!control) {
      return false;
    }
    return Object.getOwnPropertyNames(control).some((key) =>
      key.startsWith('__reactFiber$')
    );
  });
}

/**
 * Opens an UploadField's "Or paste a URL" input.
 *
 * The toggle is a client-side button. Before hydration a click is a no-op and
 * the input never appears; retry the click until the input is really visible.
 * The assertion is unchanged — the URL box must exist before it is filled —
 * this only removes the hydration race.
 */
export async function openPasteUrl(
  toggle: Locator,
  input: Locator
): Promise<void> {
  await expect(async () => {
    if (!(await input.isVisible())) {
      await toggle.click();
    }
    await expect(input).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
}

/**
 * Arms an assertion on the server-rendered SaveBanner for a redirect that
 * carries `?saved=1`, and returns a promise to await after the redirect.
 *
 * The banner removes the marker from the URL when it mounts and hides itself
 * after eight seconds, so waiting for it in the DOM races the client: a slow
 * render can consume the marker and dismiss the banner before the assertion
 * runs. The response body is the durable record that the redirect carried the
 * banner message, and it can be read after the URL and the new row have been
 * asserted. Call before the submit click so the waiter is armed.
 */
export function waitForSavedBanner(
  page: Page,
  path: string,
  message: string
): Promise<void> {
  return page
    .waitForResponse((response) => {
      if (response.request().method() !== 'GET') {
        return false;
      }
      const url = new URL(response.url());
      return url.pathname === path && url.searchParams.has('saved');
    })
    .then(async (response) => {
      expect(response.status()).toBe(200);
      expect(await response.text()).toContain(message);
    });
}
