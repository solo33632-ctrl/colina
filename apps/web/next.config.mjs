import createNextIntlPlugin from 'next-intl/plugin';

// Content-Security-Policy notes (read before tightening):
// - `script-src 'unsafe-inline'` is required: Next.js ships inline
//   bootstrap/flight scripts that a nonce-less policy would break, and
//   nonces can't be validated blind here (no browser in this pipeline).
//   The policy still blocks all non-self script SOURCES (no external JS,
//   no third-party trackers — matching project policy).
// - `frame-src` allows OpenStreetMap: the contact page embeds an OSM
//   iframe (no API key, no script). Nothing else may frame or be framed.
// - No `upgrade-insecure-requests`: it would rewrite same-origin http://
//   API calls and break local-HTTP environments outright.
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  'frame-src https://www.openstreetmap.org',
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Content-Security-Policy', value: contentSecurityPolicy },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains',
          },
        ],
      },
    ];
  },
};

// Links `./i18n/request.ts` to next-intl (conventional path, no arg needed).
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
