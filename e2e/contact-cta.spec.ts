import { test, expect, type Page } from '@playwright/test';
import {
  DATABASE_URL,
  deleteSiteSettings,
  setSiteSettings,
} from './db-fixture';

const WEB_URL = process.env.WEB_URL ?? 'http://localhost:3000';
const NUMBER = '201001234567';
const MESSAGE_EN = 'Hello from the contact CTA band';
const MESSAGE_AR = 'مرحباً من شريط دعوة التواصل';

const copy = {
  en: {
    heading: 'Get in touch',
    body: 'Tell us about your production line or maintenance needs and our team will get back to you.',
    primary: 'Contact us',
    whatsapp: 'Chat on WhatsApp',
    contactPageHeading: 'Contact us',
    message: MESSAGE_EN,
  },
  ar: {
    heading: 'تواصل معنا',
    body: 'أخبرنا باحتياجاتك في خطوط الإنتاج أو الصيانة وسيتواصل معك فريقنا.',
    primary: 'تواصل معنا',
    whatsapp: 'تحدث معنا عبر واتساب',
    contactPageHeading: 'اتصل بنا',
    message: MESSAGE_AR,
  },
} as const;

const band = (page: Page) => page.getByTestId('contact-cta');

/** next-intl prefixes both locales in this app's routing setup. */
function contactPath(locale: 'en' | 'ar') {
  return `/${locale}/contact`;
}

function whatsappUrl(message: string) {
  return `https://wa.me/${NUMBER}?text=${encodeURIComponent(message)}`;
}

test.describe('home contact CTA band', () => {
  test.skip(!DATABASE_URL, 'DATABASE_URL is required to seed SiteSettings');

  test.afterAll(() => {
    if (DATABASE_URL) {
      deleteSiteSettings();
    }
  });

  for (const locale of ['en', 'ar'] as const) {
    const text = copy[locale];

    for (const viewport of [
      { name: '1280', width: 1280, height: 900 },
      { name: '390', width: 390, height: 844 },
    ] as const) {
      test.describe(`${locale} at ${viewport.name}`, () => {
        test.use({
          viewport: { width: viewport.width, height: viewport.height },
        });

        test('is the last section, links to the localized contact page and matches the floating WhatsApp link', async ({
          page,
        }) => {
          setSiteSettings({
            whatsappNumber: NUMBER,
            whatsappMessageEn: MESSAGE_EN,
            whatsappMessageAr: MESSAGE_AR,
          });

          await page.goto(`${WEB_URL}/${locale}`);
          const cta = band(page);
          await expect(cta).toBeVisible();
          await expect(cta).toHaveAttribute(
            'aria-labelledby',
            'contact-cta-heading'
          );

          const heading = cta.getByRole('heading', {
            level: 2,
            name: text.heading,
          });
          await expect(heading).toBeVisible();
          await expect(heading).toHaveAttribute('id', 'contact-cta-heading');
          await expect(cta.getByText(text.body, { exact: true })).toBeVisible();

          // The old placeholder form is gone, along with its anchor target.
          await expect(cta.getByText(/Placeholder/i)).toHaveCount(0);
          await expect(page.getByText('Placeholder contact form')).toHaveCount(
            0
          );
          await expect(page.locator('main form')).toHaveCount(0);
          await expect(page.locator('a[href*="#contact"]')).toHaveCount(0);

          // Header and footer both point at the localized contact page. The
          // header nav is hidden below `sm`, so query the DOM rather than the
          // accessibility tree and only require visibility on wide screens.
          const headerContact = page.locator(
            `header nav a[href="${contactPath(locale)}"]`
          );
          await expect(headerContact).toHaveCount(1);
          if (viewport.width >= 640) {
            await expect(headerContact).toBeVisible();
          }
          const footerContact = page.locator(
            `footer nav a[href="${contactPath(locale)}"]`
          );
          await expect(footerContact).toHaveCount(1);
          await expect(footerContact).toBeVisible();

          // Last section before the footer, not merely present on the page.
          await expect(page.locator('main > section').last()).toHaveAttribute(
            'data-testid',
            'contact-cta'
          );
          const bandBottom = await cta.evaluate(
            (element) => element.getBoundingClientRect().bottom
          );
          const footerTop = await page
            .locator('footer')
            .evaluate((element) => element.getBoundingClientRect().top);
          expect(bandBottom).toBeLessThanOrEqual(footerTop + 1);

          const whatsappLink = cta.getByRole('link', {
            name: text.whatsapp,
            exact: true,
          });
          const expectedUrl = whatsappUrl(text.message);
          await expect(whatsappLink).toHaveAttribute('href', expectedUrl);
          await expect(whatsappLink).toHaveAttribute('target', '_blank');
          const rel = await whatsappLink.getAttribute('rel');
          expect(rel).toContain('noopener');
          expect(rel).toContain('noreferrer');

          // Same stored greeting and fallback as the floating button.
          await expect(page.getByTestId('whatsapp-button')).toHaveAttribute(
            'href',
            expectedUrl
          );

          const overflow = await page.evaluate(
            () =>
              document.documentElement.scrollWidth -
              document.documentElement.clientWidth
          );
          expect(overflow).toBeLessThanOrEqual(1);

          // The primary button is a real link to the contact page.
          await cta
            .getByRole('link', { name: text.primary, exact: true })
            .click();
          await expect(page).toHaveURL(`${WEB_URL}${contactPath(locale)}`);
          await expect(
            page.getByRole('heading', {
              level: 1,
              name: text.contactPageHeading,
            })
          ).toBeVisible();
        });
      });
    }

    test(`${locale}: no WhatsApp button without a usable stored number`, async ({
      page,
    }) => {
      await page.setViewportSize({ width: 390, height: 844 });

      // No settings row at all.
      deleteSiteSettings();
      await page.goto(`${WEB_URL}/${locale}`);
      await expect(band(page)).toBeVisible();
      await expect(
        band(page).getByRole('link', { name: text.whatsapp, exact: true })
      ).toHaveCount(0);
      await expect(page.getByTestId('whatsapp-button')).toHaveCount(0);
      await expect(
        band(page).getByRole('link', { name: text.primary, exact: true })
      ).toHaveAttribute('href', contactPath(locale));

      // A stored value that is not a usable international number.
      setSiteSettings({ whatsappNumber: '0123' });
      await page.reload();
      await expect(band(page)).toBeVisible();
      await expect(
        band(page).getByRole('link', { name: text.whatsapp, exact: true })
      ).toHaveCount(0);
      await expect(page.getByTestId('whatsapp-button')).toHaveCount(0);
    });
  }
});
