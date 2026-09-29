import type { Config } from 'tailwindcss';

// Identical to apps/web/tailwind.config.ts — see the note there for why the
// `brand` and `stone` extensions are duplicated instead of shared. Both scales
// are sampled from the real Colina logo.
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
          50: '#FFF9F3',
          100: '#FFF0E2',
          200: '#FEDDC4',
          300: '#FFBE9A',
          400: '#F7963F',
          500: '#EB693F',
          600: '#CD3F17',
          700: '#B22715',
          800: '#8F1E16',
          900: '#6E1711',
          950: '#4C0F0A',
        },
        stone: {
          50: '#F9F9FA',
          100: '#F5F5F7',
          200: '#E5E5E9',
          300: '#D3D3D7',
          400: '#A3A3A7',
          500: '#727276',
          600: '#5A5A5D',
          700: '#404044',
          800: '#262629',
          900: '#19191C',
          950: '#0F0F12',
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
