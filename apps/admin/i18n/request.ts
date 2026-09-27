import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// `requestLocale` is populated by `setRequestLocale()` calls in the layout
// and pages under `app/[locale]/...` (next-intl's documented static-rendering
// path) and, for Server Actions, by the `x-next-intl-locale` header that
// `NextIntlClientProvider` attaches to the action request. That header is why
// the admin's Server Actions can return validation messages in the admin's
// current UI language rather than always English.
//
// Same Turbopack constraint as apps/web: `next/root-params` is not used here
// because its compiler placeholder is not rewritten when imported from
// `i18n/request.ts` under Next 16.3.4.
export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = hasLocale(routing.locales, requested)
    ? requested
    : routing.defaultLocale;

  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
