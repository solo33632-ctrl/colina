'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Icon } from './icons';

// Confirmation that a create or update landed, shown on the list the form
// redirected to.
//
// The form navigates with `?saved=1`, and the list renders this when that
// marker is present. It survives a full page load and a shared link, which a
// toast kept in client state would not — and it needs nothing from the app
// shell to persist. The marker is consumed once: it is dropped from the URL on
// mount, so a reload does not resurrect the banner.
export function SaveBanner({ message }: { message: string }) {
  const t = useTranslations('Common');
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.has('saved')) {
      url.searchParams.delete('saved');
      window.history.replaceState(null, '', `${url.pathname}${url.search}`);
    }
    // Outlives a glance at the top of the list, and the close button is there
    // for anyone who wants it gone sooner.
    const timer = window.setTimeout(() => setVisible(false), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  if (!visible) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-6 flex items-start justify-between gap-3 rounded-xl border border-brand-200 bg-brand-50 px-4 py-3"
    >
      <p className="flex items-center gap-2 text-sm font-medium text-brand-900">
        <Icon name="check" className="h-5 w-5 shrink-0 text-brand-700" />
        {message}
      </p>
      <button
        type="button"
        onClick={() => setVisible(false)}
        aria-label={t('dismiss')}
        className="rounded p-1 text-brand-800 hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <Icon name="close" className="h-4 w-4" />
      </button>
    </div>
  );
}
