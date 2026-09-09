import createNextIntlPlugin from 'next-intl/plugin';

/** @type {import('next').NextConfig} */
const nextConfig = {};

// Links `./i18n/request.ts` to next-intl (conventional path, no arg needed).
const withNextIntl = createNextIntlPlugin();
export default withNextIntl(nextConfig);
