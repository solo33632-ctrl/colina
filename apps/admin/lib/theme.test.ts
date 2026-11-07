import { describe, expect, it } from 'vitest';
import {
  parseTheme,
  serializeTheme,
  themeAttribute,
  themeCookie,
  THEME_COOKIE,
  THEME_COOKIE_MAX_AGE,
} from './theme';

describe('parseTheme', () => {
  it('accepts the two explicit choices', () => {
    expect(parseTheme('light')).toBe('light');
    expect(parseTheme('dark')).toBe('dark');
  });

  it('treats missing, empty and unknown values as system', () => {
    for (const value of [undefined, null, '', 'system', 'DARK', 'sepia']) {
      expect(parseTheme(value), String(value)).toBe('system');
    }
  });
});

describe('serializeTheme / themeAttribute', () => {
  it('stores explicit themes and removes the cookie for system', () => {
    expect(serializeTheme('light')).toBe('light');
    expect(serializeTheme('dark')).toBe('dark');
    expect(serializeTheme('system')).toBeNull();
  });

  it('renders data-theme only for explicit themes', () => {
    expect(themeAttribute('light')).toBe('light');
    expect(themeAttribute('dark')).toBe('dark');
    expect(themeAttribute('system')).toBeUndefined();
  });
});

describe('root layout attribute', () => {
  it('maps the stored cookie to the <html data-theme> value', () => {
    // The layout composes parseTheme (cookie -> choice) with themeAttribute
    // (choice -> attribute). These are the only three possible outcomes.
    expect(themeAttribute(parseTheme('light'))).toBe('light');
    expect(themeAttribute(parseTheme('dark'))).toBe('dark');
    expect(themeAttribute(parseTheme(null))).toBeUndefined();
    expect(themeAttribute(parseTheme('garbage'))).toBeUndefined();
  });
});

describe('themeCookie', () => {
  it('writes a one-year, site-wide, lax cookie', () => {
    expect(themeCookie('dark', false)).toBe(
      `${THEME_COOKIE}=dark; Max-Age=${THEME_COOKIE_MAX_AGE}; Path=/; SameSite=Lax`
    );
  });

  it('adds Secure only in production', () => {
    expect(themeCookie('light', true)).toContain('; Secure');
    expect(themeCookie('light', false)).not.toContain('Secure');
  });

  it('expires the cookie when system is chosen', () => {
    const cookie = themeCookie('system', false);
    expect(cookie).toContain(`${THEME_COOKIE}=`);
    expect(cookie).toContain('Max-Age=0');
    expect(cookie).toContain('Path=/');
  });
});
