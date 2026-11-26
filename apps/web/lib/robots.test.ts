import { afterEach, describe, expect, it, vi } from 'vitest';

// Load-shim only: robots.ts imports the SEO helpers, whose navigation module
// pulls `next/navigation` and cannot load in a plain node environment.
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

import robots from '@/app/robots';

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('web robots.txt', () => {
  it('allows public pages, excludes the API and points at the sitemap', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');

    const output = robots();

    expect(output.rules).toMatchObject({
      userAgent: '*',
      allow: '/',
      disallow: ['/api'],
    });
    expect(output.sitemap).toBe('https://web.example.test/sitemap.xml');
  });

  it('uses the development base when the variable is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');

    expect(robots().sitemap).toBe('http://localhost:3000/sitemap.xml');
  });
});
