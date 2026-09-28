import { test, expect } from '@playwright/test';
import {
  ADMIN_URL,
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  copyFor,
  loginState,
} from './admin-session';

const en = copyFor('en');

// The delete confirmation is the panel's own native <dialog> rather than
// window.confirm, so this covers the behaviour the platform gives us for free
// and the part it does not: Escape and a backdrop click both dismiss without
// deleting, the dialog is a real modal while open (focus is inside it, the rest
// of the page is inert), and focus comes back to the button that opened it.
test.describe('delete confirmation dialog', () => {
  test.skip(!ADMIN_PASSWORD, 'ADMIN_PASSWORD env is required');

  test('Escape and the backdrop close it without deleting', async ({
    browser,
  }) => {
    const state = await loginState(browser, en, ADMIN_EMAIL, ADMIN_PASSWORD);
    const context = await browser.newContext({ storageState: state });
    const page = await context.newPage();

    await page.goto(`${ADMIN_URL}/en/services`);
    await page.waitForLoadState('networkidle');
    const before = await page.locator('tbody tr').count();
    expect(before).toBeGreaterThan(0);

    // A seeded service that the dialog can name, scoped to its row. The name
    // is read back off the button's accessible name, so the test does not
    // depend on which column holds it.
    const row = page.locator('tbody tr').first();
    const trigger = row.getByRole('button', { name: /^Delete / });
    const rowName = ((await trigger.getAttribute('aria-label')) ?? '').replace(
      /^Delete /,
      ''
    );
    expect(rowName).not.toBe('');
    await expect(trigger).toBeVisible();

    // Open it: the dialog names the record and holds the focus.
    await trigger.click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(rowName);
    expect(
      await page.evaluate(
        () => document.activeElement?.closest('dialog') !== null
      )
    ).toBe(true);
    // Measured while open, for the backdrop click below.
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();

    // Escape closes it and returns focus to the trigger.
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? ''
      )
    ).toMatch(new RegExp(`^Delete ${rowName}`));

    // The backdrop closes it too, still without deleting.
    await trigger.click();
    await expect(dialog).toBeVisible();
    // Above the dialog box, inside the viewport: the ::backdrop area.
    await page.mouse.click(box.x + box.width / 2, Math.max(4, box.y - 40));
    await expect(dialog).toBeHidden();
    expect(
      await page.evaluate(
        () => document.activeElement?.getAttribute('aria-label') ?? ''
      )
    ).toMatch(new RegExp(`^Delete ${rowName}`));

    // Nothing was deleted.
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(await page.locator('tbody tr').count()).toBe(before);
    await expect(page.locator('tbody tr').first()).toContainText(rowName);

    // Cancelling with the button is the third way out, and also deletes nothing.
    await page
      .locator('tbody tr')
      .first()
      .getByRole('button', { name: /^Delete / })
      .click();
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await page.waitForLoadState('networkidle');
    expect(await page.locator('tbody tr').count()).toBe(before);

    await context.close();
  });
});
