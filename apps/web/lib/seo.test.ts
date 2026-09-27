import { describe, expect, it, vi } from 'vitest';

// Load-shim only: seo.ts imports the navigation module for
// localeAlternates (covered live in Phase 14, not unit-tested here), and
// next-intl's navigation pulls `next/navigation`, which cannot load in a
// plain node environment. The helpers under test never touch it.
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

import { absoluteImageUrl, serializeJsonLd } from './seo';

describe('absoluteImageUrl', () => {
  it('passes remote http(s) URLs through untouched', () => {
    expect(absoluteImageUrl('https://cdn.test/a.jpg')).toBe(
      'https://cdn.test/a.jpg'
    );
    expect(absoluteImageUrl('http://cdn.test/a.jpg')).toBe(
      'http://cdn.test/a.jpg'
    );
  });

  it('resolves root-relative and bare paths against the canonical base', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    expect(absoluteImageUrl('/images/seed/a.jpg')).toBe(
      'https://web.example.test/images/seed/a.jpg'
    );
    expect(absoluteImageUrl('images/seed/a.jpg')).toBe(
      'https://web.example.test/images/seed/a.jpg'
    );
    vi.unstubAllEnvs();
  });

  it('returns undefined for null', () => {
    expect(absoluteImageUrl(null)).toBeUndefined();
  });
});

describe('serializeJsonLd', () => {
  it('neutralizes script breakouts from admin-entered content', () => {
    const output = serializeJsonLd({
      name: 'Evil</script><script>alert(1)',
    });
    expect(output).not.toContain('</script><script>');
    expect(output).toContain('<\\/script>');
    // Still valid JSON with the original text intact once parsed.
    expect(JSON.parse(output)).toEqual({
      name: 'Evil</script><script>alert(1)',
    });
  });
});
