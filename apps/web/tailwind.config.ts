import type { Config } from 'tailwindcss';

// Colina palette, sampled from the real logo (apps/*/public/logo.png) rather
// than eyeballed. The measured artwork is a horizontal red->orange gradient on
// the "C" (#F05438 at the left stem, #F7963F at the right tips, #EF6D43 across
// the whole mark) next to a true-neutral grey wordmark (#5A5A5C) with a
// lighter tagline (#626264).
//
// `brand` walks that measured gradient: pale peach at 50, the exact measured
// orange at 400, the mark's own mean at 500, then down to the deepest red.
// The steps below 500 are deliberately deeper than the literal artwork, because
// 600 is the darkest step allowed to carry white text (4.5:1 caps WCAG relative
// luminance at 0.1833) and 700-950 back the primary buttons, link text and the
// hero section. Every combination is contrast-checked; see the notes below.
//
// The neutral family replaces Tailwind's `stone` wholesale, under the same token
// names, so all existing `stone-*` call sites keep working. It is a TRUE
// neutral on the wordmark grey's own hue (286deg) rather than `stone`'s warm
// beige, and each step keeps the relative luminance of the `stone` step it
// replaces so nothing changes visual weight — only the hue family does.
//
// NOTE: kept identical in apps/web and apps/admin because @colina/ui
// components reference the `brand` tokens and both apps must generate them.
// Extract to a shared preset only if the two themes diverge.
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
