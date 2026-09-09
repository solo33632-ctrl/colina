import { defineRouting } from 'next-intl/routing';

export const routing = defineRouting({
  // Arabic first: default locale, served at `/` (no prefix).
  // English lives at `/en` (default `as-needed` prefix behavior).
  // Add future languages here — no other file needs restructuring.
  locales: ['ar', 'en'],
  defaultLocale: 'ar',
});
