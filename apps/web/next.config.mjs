import createNextIntlPlugin from 'next-intl/plugin';

// Content-Security-Policy notes (read before tightening):
// - `script-src 'unsafe-inline'` is required: Next.js ships inline
//   bootstrap/flight scripts that a nonce-less policy would break, and
//   nonces can't be validated blind here (no browser in this pipeline).
//   The policy still blocks all non-self script SOURCES (no external JS,
//   no third-party trackers — matching project policy).
// - `script-src 'unsafe-eval'` is added in DEVELOPMENT ONLY: React's
//   dev-mode debugging relies on eval(), which a production-strict policy
//   intentionally blocks ("eval() is not supported… React requires eval()
//   in development mode"). Production builds never ship 'unsafe-eval'.
// - `frame-src 'none'`: the public site frames nothing. The factory map was
//   the only framed content and it was removed in Stage 34b; `X-Frame-Options`
//   still prevents the site itself from being framed.
// - No `upgrade-insecure-requests`: it would rewrite same-origin http://
//   API calls and break local-HTTP environments outright.
const scriptSrc =
  process.env.NODE_ENV === 'production'
    ? "'self' 'unsafe-inline'"
    : "'self' 'unsafe-inline' 'unsafe-eval'";
const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src ${scriptSrc}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
  "form-action 'self'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
].join('; ');

// Public media is replaced only by a deploy, so a day of freshness plus a week
// of background revalidation is safe and stops every visit from revalidating
// the same logo. This rule is listed BEFORE the hashed-asset rule because a
// later matching header route wins: `/_next/static` files that happen to end in
// an image extension must keep their one-year immutable policy.
const publicImageCache = 'public, max-age=86400, stale-while-revalidate=604800';

/** @type {import('next').NextConfig} */
const nextConfig = {
  async headers() {
    return [
      {
        source: '/:path*.(png|jpg|jpeg|gif|webp|avif|svg|ico)',
        headers: [{ key: 'Cache-Control', value: publicImageCache }],
      },
      {
        // Content-addressed build output: the filename changes with the bytes,
        // so the longest safe freshness applies. Stated explicitly rather than
        // inherited, so the policy survives a future change to Next's defaults.
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
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
