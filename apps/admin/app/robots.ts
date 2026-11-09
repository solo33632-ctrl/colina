import type { MetadataRoute } from 'next';

// Internal admin tool: no crawler gets a route. The `[locale]` layout also
// sends `<meta name="robots" content="noindex, nofollow">` and next.config
// sends `X-Robots-Tag` on every response; this file covers a crawler that
// asks for /robots.txt directly.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      disallow: '/',
    },
  };
}
