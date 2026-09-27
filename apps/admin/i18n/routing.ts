import { defineRouting } from 'next-intl/routing';

// Arabic default, matching apps/web deliberately: the same path must mean
// the same language in both apps, otherwise `/machines` would be English in
// the admin and Arabic on the public site. That mismatch is a reliable
// source of confusion for staff and it breaks shared bookmarks, screenshots
// and support links. See agent.md ("Arabic (default, RTL) + English (LTR)").
//
// `localePrefix: 'always'` (next-intl's default) is set explicitly here
// because it is what we actually want for an internal tool: every admin URL
// states its language, so there is never any doubt about which locale a
// screenshot or a support ticket was taken in. It is also required for the
// proxy to be able to tell "/ar/categories" from "/categories" without
// running locale negotiation first.
export const routing = defineRouting({
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
  localePrefix: 'always',
});
