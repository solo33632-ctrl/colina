import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/seo';

// robots.txt (Next file convention). Public pages stay crawlable; the API
// endpoints are form/page-view plumbing, not documents, so they are excluded.
// The admin panel is a separate deployment that disallows everything and
// sends `X-Robots-Tag: noindex, nofollow` on every response.
export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api'],
    },
    // The base URL always exists (development fallback / production build
    // failure), so the sitemap line is always honest.
    sitemap: `${base}/sitemap.xml`,
  };
}
