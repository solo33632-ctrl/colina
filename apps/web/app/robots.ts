import type { MetadataRoute } from 'next';
import { getBaseUrl } from '@/lib/seo';

// robots.txt (Next file convention). Allows everything under apps/web —
// no public route is index-excluded. The admin panel is a separate
// deployment that already sends noindex on every route.
export default function robots(): MetadataRoute.Robots {
  const base = getBaseUrl();
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [],
    },
    // Without a configured site URL there is no honest sitemap location;
    // omit the line instead of pointing crawlers at a guessed domain.
    ...(base ? { sitemap: `${base}/sitemap.xml` } : {}),
  };
}
