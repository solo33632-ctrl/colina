import type { Browser } from '@playwright/test';
import type { StorageState } from '@playwright/test';

export const ADMIN_URL = process.env.ADMIN_URL ?? 'http://localhost:3001';
export const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? 'admin@example.com';
export const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? '';

// The admin's login endpoint allows 10 attempts per 15 minutes per IP
// (Phase 13, credential-stuffing defense). Signing in inside every test
// would spend that budget on the suite itself and make a second run fail
// for reasons that have nothing to do with the code under test. So the
// login form is exercised explicitly where it is the subject, and
// everywhere else a session is established once and reused via
// storageState.
export const LOCALES = [
  {
    id: 'en',
    email: 'Email',
    password: 'Password',
    submit: 'Log in',
    invalid: 'Invalid email or password.',
    brand: 'Colina Admin',
    audit: 'Audit log',
    denied: 'Not authorized',
  },
  {
    id: 'ar',
    email: 'البريد الإلكتروني',
    password: 'كلمة المرور',
    submit: 'تسجيل الدخول',
    invalid: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
    brand: 'لوحة تحكم كولينا',
    audit: 'سجل التدقيق',
    denied: 'غير مصرّح',
  },
] as const;

export type AdminLocaleCopy = (typeof LOCALES)[number];

export function copyFor(locale: string): AdminLocaleCopy {
  const found = LOCALES.find((entry) => entry.id === locale);
  if (!found) {
    throw new Error(`No admin copy configured for locale "${locale}"`);
  }
  return found;
}

// One sign-in per (locale, account) for the whole run, memoised: the
// specs share sessions through this and several of them want the same
// one, and the login endpoint only allows 10 attempts per 15 minutes.
const sessions = new Map<string, StorageState>();

/** Signs in through the real login form and returns the session state. */
export async function loginState(
  browser: Browser,
  locale: AdminLocaleCopy,
  email: string,
  password: string
) {
  const key = `${locale.id}:${email}`;
  const cached = sessions.get(key);
  if (cached) {
    return cached;
  }
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(`${ADMIN_URL}/${locale.id}/login`);
    await page.getByLabel(locale.email).fill(email);
    await page.getByLabel(locale.password).fill(password);
    await page.getByRole('button', { name: locale.submit }).click();
    await page.waitForURL(new RegExp(`/${locale.id}$`), { timeout: 20_000 });
    const state = await context.storageState();
    sessions.set(key, state);
    return state;
  } finally {
    await context.close();
  }
}
