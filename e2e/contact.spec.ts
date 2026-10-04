import { test, expect } from '@playwright/test';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';

test.describe('contact form', () => {
  test('valid submission shows the translated success message', async ({
    page,
  }) => {
    await page.goto(`${WEB_URL}/en/contact`);
    await page.getByLabel('Name').fill('E2E Visitor');
    await page.getByLabel('Email').fill('e2e-visitor@example.com');
    await page.getByLabel('Phone').fill('+201001234567');
    await page
      .getByLabel('Message')
      .fill('Hello from the Playwright e2e run, this is long enough.');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      page.getByText('Thank you — your message was received.')
    ).toBeVisible();
  });

  test('invalid input shows field errors and never POSTs', async ({ page }) => {
    let posted = false;
    page.on('request', (request) => {
      if (
        request.url().endsWith('/api/contact') &&
        request.method() === 'POST'
      ) {
        posted = true;
      }
    });
    await page.goto(`${WEB_URL}/en/contact`);
    await page.getByLabel('Email').fill('not-an-email');
    await page.getByRole('button', { name: 'Send message' }).click();
    await expect(
      page.getByText('Please enter a valid email address.')
    ).toBeVisible();
    await expect(
      page.getByText('Thank you — your message was received.')
    ).toBeHidden();
    expect(posted).toBe(false);
  });
});
