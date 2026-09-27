import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware wrappers around Next.js navigation APIs. `usePathname`
// returns the pathname without the locale prefix, so `router.replace` with
// `{locale}` keeps the admin on the same page when the language is switched.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
