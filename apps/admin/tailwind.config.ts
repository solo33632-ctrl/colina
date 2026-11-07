import type { Config } from 'tailwindcss';

// The admin palette is semantic: every colour below resolves through a CSS
// variable defined in `app/globals.css`, so switching `data-theme` (or the OS
// preference in system mode) flips the whole panel from one place. Light-mode
// values are the exact hex values the panel shipped with, which is why the
// generated utilities still read `bg-white`, `text-stone-700`, `brand-…`.
//
// `plate` is the one deliberate exception: white artwork backgrounds and text
// on filled controls must stay white in both themes. `overlay` is the modal
// scrim. `chart` is the Insights-only palette, contrast-checked per theme.
const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    '../../packages/ui/src/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        white: 'rgb(var(--surface-card) / <alpha-value>)',
        plate: 'rgb(var(--plate) / <alpha-value>)',
        overlay: 'rgb(var(--overlay) / <alpha-value>)',
        stone: {
          50: 'rgb(var(--surface-page) / <alpha-value>)',
          100: 'rgb(var(--surface-subtle) / <alpha-value>)',
          200: 'rgb(var(--border-default) / <alpha-value>)',
          300: 'rgb(var(--border-strong) / <alpha-value>)',
          400: 'rgb(var(--text-faint) / <alpha-value>)',
          500: 'rgb(var(--text-muted) / <alpha-value>)',
          600: 'rgb(var(--text-secondary) / <alpha-value>)',
          700: 'rgb(var(--text-normal) / <alpha-value>)',
          800: 'rgb(var(--text-strong) / <alpha-value>)',
          900: 'rgb(var(--text-heading) / <alpha-value>)',
          950: 'rgb(var(--text-black) / <alpha-value>)',
        },
        brand: {
          50: 'rgb(var(--brand-50) / <alpha-value>)',
          100: 'rgb(var(--brand-100) / <alpha-value>)',
          200: 'rgb(var(--brand-200) / <alpha-value>)',
          300: 'rgb(var(--brand-300) / <alpha-value>)',
          400: 'rgb(var(--brand-400) / <alpha-value>)',
          500: 'rgb(var(--brand-500) / <alpha-value>)',
          600: 'rgb(var(--brand-600) / <alpha-value>)',
          700: 'rgb(var(--brand-700) / <alpha-value>)',
          800: 'rgb(var(--brand-800) / <alpha-value>)',
          900: 'rgb(var(--brand-900) / <alpha-value>)',
          950: 'rgb(var(--brand-950) / <alpha-value>)',
        },
        red: {
          50: 'rgb(var(--status-danger-bg) / <alpha-value>)',
          300: 'rgb(var(--status-danger-border) / <alpha-value>)',
          700: 'rgb(var(--status-danger-text) / <alpha-value>)',
          800: 'rgb(var(--status-danger-hover) / <alpha-value>)',
        },
        amber: {
          50: 'rgb(var(--status-warning-bg) / <alpha-value>)',
          300: 'rgb(var(--status-warning-border) / <alpha-value>)',
          500: 'rgb(var(--status-warning-accent) / <alpha-value>)',
          900: 'rgb(var(--status-warning-text) / <alpha-value>)',
        },
        green: {
          700: 'rgb(var(--status-success-text) / <alpha-value>)',
        },
        chart: {
          grid: 'rgb(var(--chart-grid) / <alpha-value>)',
          'grid-muted': 'rgb(var(--chart-grid-muted) / <alpha-value>)',
          axis: 'rgb(var(--chart-axis) / <alpha-value>)',
          previous: 'rgb(var(--chart-previous) / <alpha-value>)',
          'brand-line': 'rgb(var(--chart-brand-line) / <alpha-value>)',
          'brand-area': 'rgb(var(--chart-brand-area) / <alpha-value>)',
          'section-home': 'rgb(var(--chart-section-home) / <alpha-value>)',
          'section-machines':
            'rgb(var(--chart-section-machines) / <alpha-value>)',
          'section-categories':
            'rgb(var(--chart-section-categories) / <alpha-value>)',
          'section-maintenance':
            'rgb(var(--chart-section-maintenance) / <alpha-value>)',
          'section-contact':
            'rgb(var(--chart-section-contact) / <alpha-value>)',
          'section-other': 'rgb(var(--chart-section-other) / <alpha-value>)',
          'locale-ar': 'rgb(var(--chart-locale-ar) / <alpha-value>)',
          'locale-en': 'rgb(var(--chart-locale-en) / <alpha-value>)',
          'security-rate': 'rgb(var(--chart-security-rate) / <alpha-value>)',
          'security-honeypot':
            'rgb(var(--chart-security-honeypot) / <alpha-value>)',
          'security-login': 'rgb(var(--chart-security-login) / <alpha-value>)',
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
