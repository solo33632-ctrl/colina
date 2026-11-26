import { afterEach, describe, expect, it, vi } from 'vitest';

// Load-shim only: seo.ts imports the navigation module for
// localeAlternates and breadcrumbs, and next-intl's navigation pulls
// `next/navigation`, which cannot load in a plain node environment.
vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

import {
  absoluteImageUrl,
  buildBreadcrumbList,
  buildOpenGraph,
  buildPageMetadata,
  buildTwitter,
  defaultShareImageUrl,
  getBaseUrl,
  getMetadataBase,
  localeAlternates,
  localizedValue,
  serializeJsonLd,
  shareImageUrl,
  truncateSeoDescription,
  truncateSeoTitle,
} from './seo';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('getBaseUrl', () => {
  it('normalizes trailing slashes', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test///');
    expect(getBaseUrl()).toBe('https://web.example.test');
  });

  it('falls back to localhost in development and warns once', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    getBaseUrl();
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(getBaseUrl()).toBe('http://localhost:3000');
    expect(getBaseUrl()).toBe('http://localhost:3000');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('treats an invalid value like a missing one in development', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'not a url');
    expect(getBaseUrl()).toBe('http://localhost:3000');
  });

  it('fails loudly in production when the variable is missing', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_WEB_URL is required/);
  });

  it('fails loudly in production when the variable is invalid', () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'ftp://web.example.test');
    expect(() => getBaseUrl()).toThrow(/NEXT_PUBLIC_WEB_URL is required/);
  });
});

describe('getMetadataBase', () => {
  it('returns a URL object for the configured base', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test/');
    expect(getMetadataBase().toString()).toBe('https://web.example.test/');
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
  });

  it('uses the development fallback instead of omitting alternates', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    await expect(localeAlternates('/about', 'ar')).resolves.toEqual({
      canonical: 'http://localhost:3000/ar/about',
      languages: {
        ar: 'http://localhost:3000/ar/about',
        en: 'http://localhost:3000/en/about',
        'x-default': 'http://localhost:3000/ar/about',
      },
    });
  });
});

describe('truncateSeoTitle', () => {
  it('leaves a short title untouched', () => {
    expect(truncateSeoTitle('Colina Belt 500')).toBe('Colina Belt 500');
  });

  it('cuts a long title at a word boundary inside 60 characters', () => {
    const title =
      'Colina high-capacity stainless steel production line for food manufacturers';
    const truncated = truncateSeoTitle(title);
    expect(Array.from(truncated).length).toBeLessThanOrEqual(60);
    expect(truncated.endsWith('…')).toBe(true);
    expect(title.startsWith(truncated.slice(0, -1))).toBe(true);
    expect(truncated).not.toMatch(/\s…$/u);
  });

  it('never cuts inside an HTML entity', () => {
    const truncated = truncateSeoTitle(`${'a'.repeat(55)} &amp; more text`);
    expect(truncated).not.toContain('&');
    expect(truncated.endsWith('…')).toBe(true);
  });

  it('normalizes runs of whitespace', () => {
    expect(truncateSeoTitle('  Food   lines  ')).toBe('Food lines');
  });
});

describe('truncateSeoDescription', () => {
  it('leaves a short description untouched', () => {
    expect(truncateSeoDescription('500 mm wide conveyor belt.')).toBe(
      '500 mm wide conveyor belt.'
    );
  });

  it('cuts a long description at a word boundary inside 160 characters', () => {
    const description = 'Reliable food production machinery. '.repeat(10);
    const truncated = truncateSeoDescription(description);
    expect(Array.from(truncated).length).toBeLessThanOrEqual(160);
    expect(truncated.endsWith('…')).toBe(true);
    expect(truncated).not.toMatch(/\s…$/u);
  });
});

describe('localizedValue', () => {
  it('prefers the requested locale', () => {
    expect(localizedValue('ar', 'عربي', 'English')).toBe('عربي');
    expect(localizedValue('en', 'عربي', 'English')).toBe('English');
  });

  it('falls back to the other locale when the requested one is blank', () => {
    expect(localizedValue('ar', '   ', 'English')).toBe('English');
    expect(localizedValue('en', 'عربي', '')).toBe('عربي');
    expect(localizedValue('en', null, undefined)).toBe('');
  });
});

describe('serializeJsonLd', () => {
  it('neutralizes script breakouts from admin-entered content', () => {
    const output = serializeJsonLd({
      name: '</script><script>alert(1)</script>',
    });
    expect(output).not.toContain('</script>');
    expect(output).not.toContain('<');
    expect(output).not.toContain('>');
    expect(output).toContain('\\u003c');
    // Still valid JSON with the original text intact once parsed.
    expect(JSON.parse(output)).toEqual({
      name: '</script><script>alert(1)</script>',
    });
  });

  it('escapes ampersands and the JavaScript line separators', () => {
    const value = { text: 'R&D <b>\u2028\u2029' };
    const output = serializeJsonLd(value);
    expect(output).not.toContain('&');
    expect(output).not.toContain('\u2028');
    expect(output).not.toContain('\u2029');
    expect(output).toContain('\\u0026');
    expect(output).toContain('\\u2028');
    expect(output).toContain('\\u2029');
    expect(JSON.parse(output)).toEqual(value);
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
  });
});

describe('defaultShareImageUrl', () => {
  it('points at the static card', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
    expect(defaultShareImageUrl()).toBe(
      'https://web.example.test/og-default.png'
    );
  });

  it('uses the development fallback when the base is missing', () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', '');
    expect(defaultShareImageUrl()).toBe('http://localhost:3000/og-default.png');
  });
});

describe('buildOpenGraph', () => {
  it('sets the page copy, site, locale pair, URL and default image', () => {
    expect(
      buildOpenGraph({
        locale: 'ar',
        siteName: 'كولينا',
        title: 'خطوط إنتاج',
        description: 'وصف',
        url: 'https://web.example.test/ar',
        imageUrl: 'https://web.example.test/og-default.png',
        imageAlt: 'كولينا',
        imageWidth: 1200,
        imageHeight: 630,
      })
    ).toEqual({
      type: 'website',
      siteName: 'كولينا',
      title: 'خطوط إنتاج',
      description: 'وصف',
      url: 'https://web.example.test/ar',
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

  it('omits images when no image is supplied', () => {
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
  it('uses a large summary card with copy and the share image', () => {
    expect(
      buildTwitter(
        'https://web.example.test/og-default.png',
        'Title',
        'Description'
      )
    ).toEqual({
      card: 'summary_large_image',
      title: 'Title',
      description: 'Description',
      images: ['https://web.example.test/og-default.png'],
    });
  });

  it('keeps the card without an image when none is supplied', () => {
    expect(buildTwitter()).toEqual({ card: 'summary_large_image' });
  });
});

describe('buildPageMetadata', () => {
  it('builds canonical, hreflang, OpenGraph and Twitter from one input', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');

    const metadata = await buildPageMetadata({
      locale: 'en',
      href: '/machines/belt',
      title: 'Colina Belt 500',
      description: '500 mm wide conveyor belt.',
      siteName: 'Colina',
    });

    expect(metadata.title).toBe('Colina Belt 500');
    expect(metadata.description).toBe('500 mm wide conveyor belt.');
    expect(metadata.alternates).toEqual({
      canonical: 'https://web.example.test/en/machines/belt',
      languages: {
        ar: 'https://web.example.test/ar/machines/belt',
        en: 'https://web.example.test/en/machines/belt',
        'x-default': 'https://web.example.test/ar/machines/belt',
      },
    });
    expect(metadata.openGraph).toMatchObject({
      type: 'website',
      siteName: 'Colina',
      title: 'Colina Belt 500',
      description: '500 mm wide conveyor belt.',
      url: 'https://web.example.test/en/machines/belt',
      locale: 'en_US',
      alternateLocale: ['ar_AR'],
      images: [
        {
          url: 'https://web.example.test/og-default.png',
          width: 1200,
          height: 630,
          alt: 'Colina',
        },
      ],
    });
    expect(metadata.twitter).toEqual({
      card: 'summary_large_image',
      title: 'Colina Belt 500',
      description: '500 mm wide conveyor belt.',
      images: ['https://web.example.test/og-default.png'],
    });
  });

  it('truncates long copy and accepts a page-specific image and robots', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');

    const metadata = await buildPageMetadata({
      locale: 'ar',
      href: '/categories/line',
      title: 'فئة ' + 'طويلة '.repeat(20),
      description: 'وصف '.repeat(80),
      siteName: 'كولينا',
      image: {
        url: 'https://cdn.test/category.jpg',
        alt: 'فئة',
      },
      robots: { index: false, follow: true },
    });

    expect(Array.from(metadata.title as string).length).toBeLessThanOrEqual(60);
    expect(
      Array.from(metadata.description as string).length
    ).toBeLessThanOrEqual(160);
    expect(metadata.robots).toEqual({ index: false, follow: true });
    expect(metadata.openGraph).toMatchObject({
      images: [{ url: 'https://cdn.test/category.jpg', alt: 'فئة' }],
    });
    expect(metadata.twitter).toMatchObject({
      images: ['https://cdn.test/category.jpg'],
    });
  });
});

describe('buildBreadcrumbList', () => {
  it('builds a localized, absolute trail', async () => {
    vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');

    await expect(
      buildBreadcrumbList('en', [
        { name: 'Home', href: '/' },
        { name: 'Conveying Systems', href: '/categories/conveying-systems' },
        {
          name: 'Colina Belt 500',
          href: '/machines/colina-belt-500',
        },
      ])
    ).resolves.toEqual({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        {
          '@type': 'ListItem',
          position: 1,
          name: 'Home',
          item: 'https://web.example.test/en',
        },
        {
          '@type': 'ListItem',
          position: 2,
          name: 'Conveying Systems',
          item: 'https://web.example.test/en/categories/conveying-systems',
        },
        {
          '@type': 'ListItem',
          position: 3,
          name: 'Colina Belt 500',
          item: 'https://web.example.test/en/machines/colina-belt-500',
        },
      ],
    });
  });
});
