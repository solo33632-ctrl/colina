import { hasLocale } from 'next-intl';
import { getRequestConfig } from 'next-intl/server';
import { routing } from './routing';

// `requestLocale` is populated by `setRequestLocale()` calls in layouts
// and pages (see `app/[locale]/...`). This is next-intl's documented
// static-rendering path. (`next/root-params` is the newer alternative, but
// Turbopack does not rewrite its compiler placeholder when imported from
// `i18n/request.ts` under Next 16.3.4, so it can't be used here yet.)
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
