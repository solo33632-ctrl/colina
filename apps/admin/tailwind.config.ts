import type { Config } from 'tailwindcss';

// Identical to apps/web/tailwind.config.ts — see the note there for why
// the `brand` extension is duplicated instead of shared.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#effaf5',
          100: '#d7f0e4',
          200: '#b2e0cb',
          300: '#7fcab0',
          400: '#4aad8d',
          500: '#2b9272',
          600: '#1c755c',
          700: '#175e4b',
          800: '#154c3e',
          900: '#123f34',
          950: '#0a2520',
        },
      },
      fontFamily: {
        // Latin-first (admin is English-only in Phase 3).
        sans: [
          'var(--font-latin)',
          'var(--font-arabic)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        // Arabic-first (unused while the admin stays English-only).
        arabic: [
          'var(--font-arabic)',
          'var(--font-latin)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
      },
    },
  },
  plugins: [],
};

export default config;
