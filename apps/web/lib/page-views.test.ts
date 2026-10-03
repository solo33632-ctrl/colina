import { describe, expect, it } from 'vitest';
import {
  isCrawlerUserAgent,
  isPublicPagePath,
  pageViewInputSchema,
} from './page-views';

describe('isCrawlerUserAgent', () => {
  it('excludes every well-known crawler by name', () => {
    const agents = [
      'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
      'Mozilla/5.0 (compatible; Yahoo! Slurp; http://help.yahoo.com/help/us/ysearch/slurp)',
      'DuckDuckBot/1.1; (+http://duckduckgo.com/duckduckbot.html)',
      'Baiduspider/2.0; (+http://www.baidu.com/search/spider.html)',
      'Mozilla/5.0 (compatible; YandexBot/3.0; +http://yandex.com/bots)',
      'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)',
      'Twitterbot/1.0',
    ];
    for (const agent of agents) {
      expect(isCrawlerUserAgent(agent), agent).toBe(true);
    }
  });

  it('excludes the generic bot/spider/crawler fallback, case-insensitively', () => {
    for (const agent of ['SomeUnknownBot/1.0', 'a-SPIDER', 'x crawler y']) {
      expect(isCrawlerUserAgent(agent), agent).toBe(true);
    }
  });

  it('counts ordinary desktop and mobile browsers', () => {
    const browsers = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
      'Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0',
    ];
    for (const agent of browsers) {
      expect(isCrawlerUserAgent(agent), agent).toBe(false);
    }
  });

  it('treats a missing User-Agent as a crawler', () => {
    expect(isCrawlerUserAgent(null)).toBe(true);
    expect(isCrawlerUserAgent(undefined)).toBe(true);
    expect(isCrawlerUserAgent('   ')).toBe(true);
  });
});

describe('isPublicPagePath', () => {
  it('accepts every static public route and the home page', () => {
    for (const path of [
      '/',
      '/about',
      '/categories',
      '/contact',
      '/partners',
      '/privacy',
      '/services',
    ]) {
      expect(isPublicPagePath(path), path).toBe(true);
    }
  });

  it('accepts collection detail pages', () => {
    expect(isPublicPagePath('/categories/production-lines')).toBe(true);
    expect(isPublicPagePath('/machines/colina-pack-s')).toBe(true);
    expect(isPublicPagePath('/machines/colina-pro-1000')).toBe(true);
  });

  it('rejects paths that are not public pages', () => {
    for (const path of [
      '/admin',
      '/api/contact',
      '/_next/static/chunk',
      '/categories/production-lines/extra',
      '/privacy/',
      '//privacy',
      '/privacy ',
      '/categories/UPPER-CASE',
      '/categories/has_underscore',
      '/categories/-leading',
      '/categories/trailing-',
      '/about/anything',
      '/en/privacy',
      '/ar',
    ]) {
      expect(isPublicPagePath(path), path).toBe(false);
    }
  });

  it('rejects an absurdly long path before anything else', () => {
    expect(isPublicPagePath(`/categories/${'a'.repeat(300)}`)).toBe(false);
  });
});

describe('pageViewInputSchema', () => {
  it('accepts a real page payload', () => {
    const parsed = pageViewInputSchema.safeParse({
      path: '/machines/colina-pack-s',
      locale: 'en',
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an unknown locale', () => {
    expect(
      pageViewInputSchema.safeParse({ path: '/', locale: 'fr' }).success
    ).toBe(false);
    expect(
      pageViewInputSchema.safeParse({ path: '/', locale: 'AR' }).success
    ).toBe(false);
  });

  it('rejects a non-public path', () => {
    expect(
      pageViewInputSchema.safeParse({ path: '/api/contact', locale: 'ar' })
        .success
    ).toBe(false);
  });

  it('drops unknown keys instead of passing them to the writer', () => {
    // Zod strips what the schema does not declare, so a caller smuggling an
    // `ip` (or anything else) cannot get it stored: only these two fields
    // reach recordPageView.
    const parsed = pageViewInputSchema.safeParse({
      path: '/',
      locale: 'ar',
      ip: '9.9.9.9',
      userAgent: 'Mozilla/5.0',
    });
    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data).toEqual({ path: '/', locale: 'ar' });
  });

  it('rejects a missing or mistyped payload', () => {
    expect(pageViewInputSchema.safeParse({}).success).toBe(false);
    expect(
      pageViewInputSchema.safeParse({ path: 42, locale: 'ar' }).success
    ).toBe(false);
    expect(pageViewInputSchema.safeParse({ path: '/' }).success).toBe(false);
  });
});
