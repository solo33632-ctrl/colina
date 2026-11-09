import createNextIntlPlugin from 'next-intl/plugin';

// Same policy as apps/web except `frame-src 'none'`: the admin panel
// embeds no iframes at all, so nothing needs framing permission. See
// apps/web/next.config.mjs for the CSP rationale.
//
// Stage 2a changes:
// - `img-src` is pinned to the one remote host the upload path can produce
//   (`res.cloudinary.com`) plus local/data/blob previews, instead of any
//   https host.
// - `Permissions-Policy`, `X-Robots-Tag` and a production-only HSTS header
//   are added below.
//
// Stage 2b: this static policy is development-only. Production needs a
// per-request nonce (Next's inline bootstrap cannot run under
// `script-src 'self'`), and a nonce cannot be emitted from `headers()`.
// `proxy.ts` builds and attaches the production policy instead; emitting
// one here too would either shadow the nonced header or reintroduce
// `script-src 'unsafe-inline'`, which production must not have.
const isProduction = process.env.NODE_ENV === 'production';
const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://res.cloudinary.com",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'none'",
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
          // Development only; production CSP comes from proxy.ts (nonce).
          ...(isProduction
            ? []
            : [
                {
                  key: 'Content-Security-Policy',
                  value: contentSecurityPolicy,
                },
              ]),
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=()',
          },
          // Internal tool: noindex on every response, including API routes
          // and redirects whose body has no localized <meta> tag.
          { key: 'X-Robots-Tag', value: 'noindex, nofollow' },
          // HSTS only where HTTPS is actually served. Sending it from the
          // http dev server is meaningless and can poison localhost.
          ...(isProduction
            ? [
                {
                  key: 'Strict-Transport-Security',
                  value: 'max-age=63072000; includeSubDomains',
                },
              ]
            : []),
        ],
      },
    ];
  },
};

// Links `./i18n/request.ts` to next-intl (conventional path, no arg needed).
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
