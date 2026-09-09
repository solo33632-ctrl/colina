import { createNavigation } from 'next-intl/navigation';
import { routing } from './routing';

// Locale-aware wrappers around Next.js navigation APIs.
// `usePathname` returns the pathname without prefix; `router.replace` with
// `{locale}` keeps the user on the same page when switching languages.
export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
