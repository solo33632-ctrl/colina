'use client';

import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { Icon } from './icons';

// Save/Cancel bar pinned to the bottom of the viewport while a long form
// scrolls. The negative margins pull it out to the edges of the page's content
// column (matching the Container's own padding), and the form reserves the
// same height as bottom padding so the last field can always be scrolled clear
// of it.
//
// `z-10` keeps it under the shell's sticky top bar and, more importantly,
// under the mobile navigation drawer and its backdrop (z-30/z-40), so opening
// the drawer never reveals the bar through it.
export function FormActions({
  submitLabel,
  isSubmitting,
  cancelHref,
}: {
  submitLabel: string;
  isSubmitting: boolean;
  cancelHref: string;
}) {
  const common = useTranslations('Common');

  return (
    <div className="sticky bottom-0 z-10 -mx-4 border-t border-stone-200 bg-white/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? (
            <>
              <Icon name="spinner" className="me-2 h-4 w-4 animate-spin" />
              {common('saving')}
            </>
          ) : (
            submitLabel
          )}
        </Button>
        <Link
          href={cancelHref}
          className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 hover:text-stone-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {common('cancel')}
        </Link>
      </div>
    </div>
  );
}
