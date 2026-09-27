import { test, expect } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3120';

// DOM/computed-style assertions (no screenshots): the locale must drive
// `dir`/`lang`, and the logical-property utilities must resolve per
// direction. The language switcher wrapper uses `ms-auto`
// (margin-inline-start), which flips physical sides between RTL and LTR.
test.describe('RTL/LTR', () => {
  test('/ar is RTL with Arabic copy', async ({ page }) => {
    await page.goto(`${WEB_URL}/ar`);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'rtl');
    await expect(html).toHaveAttribute('lang', 'ar');
    await expect(
      page.getByRole('heading', { name: 'خطوط إنتاج الأغذية، مصممة لتدوم' })
    ).toBeVisible();
  });

  test('/en is LTR with English copy', async ({ page }) => {
    await page.goto(`${WEB_URL}/en`);
    const html = page.locator('html');
    await expect(html).toHaveAttribute('dir', 'ltr');
    await expect(html).toHaveAttribute('lang', 'en');
    await expect(
      page.getByRole('heading', {
        name: 'Food production lines, built to last',
      })
    ).toBeVisible();
  });

  test('logical margin resolves per direction', async ({ page }) => {
    // The switcher wrapper uses `ms-auto` (margin-inline-start). In a flex
    // row the used value absorbs free space, so the declaration is proven
    // by the class plus opposite physical sides per direction.
    const wrapperBox = async (path: string, otherLanguage: string) => {
      await page.goto(`${WEB_URL}${path}`);
      await expect(
        page.getByRole('button', { name: otherLanguage })
      ).toBeVisible();
      return page.locator('header div.ms-auto').evaluate((element) => {
        const style = getComputedStyle(element);
        return {
          documentDirection: getComputedStyle(document.documentElement)
            .direction,
          hasLogicalClass: element.className.split(' ').includes('ms-auto'),
          marginLeft: style.marginLeft,
          marginRight: style.marginRight,
        };
      });
    };

    const ar = await wrapperBox('/ar', 'English');
    const en = await wrapperBox('/en', 'العربية');
    expect(ar.documentDirection).toBe('rtl');
    expect(en.documentDirection).toBe('ltr');
    expect(ar.hasLogicalClass).toBe(true);
    expect(en.hasLogicalClass).toBe(true);
    // Inline-start free space lands right in RTL, left in LTR.
    expect(ar.marginRight).not.toBe('0px');
    expect(ar.marginLeft).toBe('0px');
    expect(en.marginLeft).not.toBe('0px');
    expect(en.marginRight).toBe('0px');
  });
});
