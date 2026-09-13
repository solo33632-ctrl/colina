import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/seo';

// robots.txt (Next file convention). Allows everything under apps/web —
// no public route is index-excluded. The admin panel is a separate
// deployment that already sends noindex on every route.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [],
    },
    sitemap: `${getBaseUrl()}/sitemap.xml`,
  };
}
