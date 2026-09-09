import type { Config } from 'tailwindcss';

// Colina starting palette (neutral industrial base + deep teal-green
// primary). Not final branding — Colina can adjust the scales later.
// NOTE: kept identical in apps/web and apps/admin because @colina/ui
// components reference the `brand` tokens and both apps must generate
// them. Extract to a shared preset only if the two themes diverge.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './i18n/**/*.{js,ts}',
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
        // Latin-first (English/LTR pages).
        sans: [
          'var(--font-latin)',
          'var(--font-arabic)',
          'ui-sans-serif',
          'system-ui',
          'sans-serif',
        ],
        // Arabic-first (Arabic/RTL pages).
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
