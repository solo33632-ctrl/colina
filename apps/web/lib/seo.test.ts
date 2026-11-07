import { describe, expect, it, vi } from 'vitest';

// Load-shim only: seo.ts imports the navigation module for
// localeAlternates (covered live in Phase 14, not unit-tested here), and
// next-intl's navigation pulls `next/navigation`, which cannot load in a
// plain node environment. The helpers under test never touch it.
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

import {
  absoluteImageUrl,
  buildOpenGraph,
  buildTwitter,
  defaultShareImageUrl,
  getBaseUrl,
  getMetadataBase,
  localeAlternates,
  serializeJsonLd,
  shareImageUrl,
} from './seo';

describe('getBaseUrl', () => {
  it('normalizes trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test///');
    expect(getBaseUrl()).toBe('https://web.example.test');
    vi.unstubAllEnvs();
  });

  it('rejects values that are not an http(s) URL', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'not a url');
    expect(getBaseUrl()).toBeNull();
    vi.unstubAllEnvs();
  });

  it('returns null and warns once when the variable is missing', () => {
    // A valid value clears the module's once-per-process warning latch, so
    // this test does not depend on which tests ran before it.
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    getBaseUrl();
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getBaseUrl()).toBeNull();
    expect(getBaseUrl()).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
    vi.unstubAllEnvs();
  });
});

describe('getMetadataBase', () => {
  it('returns a URL object when configured and undefined when missing', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test/');
    expect(getMetadataBase()?.toString()).toBe('https://web.example.test/');

    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    expect(getMetadataBase()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe('localeAlternates', () => {
  it('builds the canonical and both locale alternates from the base URL', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test/');
    await expect(localeAlternates('/about', 'en')).resolves.toEqual({
      canonical: 'https://web.example.test/en/about',
      languages: {
        ar: 'https://web.example.test/ar/about',
        en: 'https://web.example.test/en/about',
        'x-default': 'https://web.example.test/ar/about',
      },
    });
    vi.unstubAllEnvs();
  });

  it('omits alternates entirely when the base URL is missing', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    await expect(localeAlternates('/about', 'en')).resolves.toBeUndefined();
    vi.unstubAllEnvs();
  });
});

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

  it('returns undefined for a relative path when the base is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    expect(absoluteImageUrl('/images/seed/a.jpg')).toBeUndefined();
    vi.unstubAllEnvs();
  });

  it('returns undefined for null', () => {
    expect(absoluteImageUrl(null)).toBeUndefined();
  });
});

describe('shareImageUrl', () => {
  it('passes https images through and refuses http and data images', () => {
    expect(shareImageUrl('https://cdn.test/a.jpg')).toBe(
      'https://cdn.test/a.jpg'
    );
    expect(shareImageUrl('http://cdn.test/a.jpg')).toBeUndefined();
    expect(shareImageUrl('data:image/svg+xml;base64,abc')).toBeUndefined();
    expect(shareImageUrl(null)).toBeUndefined();
  });

  it('resolves a root-relative photo only on an https base', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    expect(shareImageUrl('/images/seed/a.jpg')).toBe(
      'https://web.example.test/images/seed/a.jpg'
    );

    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'http://localhost:3000');
    expect(shareImageUrl('/images/seed/a.jpg')).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe('defaultShareImageUrl', () => {
  it('points at the static card and is omitted without a base', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    expect(defaultShareImageUrl()).toBe(
      'https://web.example.test/og-default.png'
    );

    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    expect(defaultShareImageUrl()).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe('buildOpenGraph', () => {
  it('sets the site, locale pair and default image', () => {
    expect(
      buildOpenGraph({
        locale: 'ar',
        siteName: 'كولينا',
        imageUrl: 'https://web.example.test/og-default.png',
        imageAlt: 'كولينا',
        imageWidth: 1200,
        imageHeight: 630,
      })
    ).toEqual({
      type: 'website',
      siteName: 'كولينا',
      locale: 'ar_AR',
      alternateLocale: ['en_US'],
      images: [
        {
          url: 'https://web.example.test/og-default.png',
          width: 1200,
          height: 630,
          alt: 'كولينا',
        },
      ],
    });
  });

  it('omits images when no base URL is available', () => {
    const openGraph = buildOpenGraph({ locale: 'en', siteName: 'Colina' });
    expect(openGraph).toMatchObject({
      type: 'website',
      siteName: 'Colina',
      locale: 'en_US',
      alternateLocale: ['ar_AR'],
    });
    expect(openGraph).not.toHaveProperty('images');
  });

  it('omits dimensions for a real photo whose size is unknown', () => {
    const openGraph = buildOpenGraph({
      locale: 'en',
      siteName: 'Colina',
      imageUrl: 'https://cdn.test/machine.jpg',
      imageAlt: 'Machine',
    });
    expect(openGraph.images).toEqual([
      { url: 'https://cdn.test/machine.jpg', alt: 'Machine' },
    ]);
  });
});

describe('buildTwitter', () => {
  it('uses a large summary card with the share image', () => {
    expect(buildTwitter('https://web.example.test/og-default.png')).toEqual({
      card: 'summary_large_image',
      images: ['https://web.example.test/og-default.png'],
    });
  });

  it('keeps the card without an image when the base is missing', () => {
    expect(buildTwitter()).toEqual({ card: 'summary_large_image' });
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
