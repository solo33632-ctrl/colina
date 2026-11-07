'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon, type IconName } from './icons';
import { ADMIN_THEMES, themeCookie, type AdminTheme } from '@/lib/theme';

const OPTION_ICONS: Record<AdminTheme, IconName> = {
  light: 'sun',
  dark: 'moon',
  system: 'monitor',
};

// Three explicit choices in one compact control. A pressed button is the
// selected mode; every button has a translated accessible name and its own
// title, and the group is keyboard-operable with the platform's native
// button semantics.
//
// The initial state is rendered by the server from the cookie, so there is no
// hydration mismatch and no need to read `document.cookie` on mount. Choosing
// an option writes the cookie and updates the document element in the same
// task: the page repaints immediately, without a reload.
export function ThemeToggle({ initialTheme }: { initialTheme: AdminTheme }) {
  const t = useTranslations('Theme');
  const [theme, setTheme] = useState<AdminTheme>(initialTheme);

  // The document element and the cookie are external systems, so they are
  // updated in an effect rather than during render. The effect also runs once
  // after hydration with the server-rendered choice; re-applying the same
  // attribute is a no-op, and for "system" the attribute is already absent.
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'system') {
      delete root.dataset.theme;
    } else {
      root.dataset.theme = theme;
    }

    document.cookie = themeCookie(theme, process.env.NODE_ENV === 'production');
  }, [theme]);

  function select(next: AdminTheme) {
    setTheme(next);
  }

  return (
    <div
      role="group"
      aria-label={t('label')}
      data-testid="theme-toggle"
      className="flex shrink-0 items-center rounded-lg border border-stone-300 bg-white p-0.5"
    >
      {ADMIN_THEMES.map((option) => {
        const active = theme === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => select(option)}
            aria-pressed={active}
            aria-label={t(option)}
            title={t(option)}
            data-testid={`theme-${option}`}
            className={[
              'grid h-7 w-7 place-items-center rounded-md transition-colors focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-brand-600',
              active
                ? 'bg-brand-700 text-white'
                : 'text-stone-500 hover:bg-stone-100 hover:text-stone-900',
            ].join(' ')}
          >
            <Icon name={OPTION_ICONS[option]} className="h-4 w-4" />
          </button>
        );
      })}
    </div>
  );
}
