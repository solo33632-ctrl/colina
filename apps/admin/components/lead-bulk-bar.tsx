'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { deleteLeads } from '@/lib/actions/leads';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icons';
import { useLeadSelection } from './lead-selection';

// Adds the marker the list page turns into a success banner. The href already
// carries the current filters and page, so the banner never loses them.
function withDeleted(href: string, count: number): string {
  const [path, query = ''] = href.split('?');
  const params = new URLSearchParams(query);
  params.set('deleted', String(count));
  return `${path}?${params.toString()}`;
}

export function LeadBulkBar({
  successHref,
  previousPageHref,
  pageCount,
}: {
  /** Current list URL (filters kept), used when rows remain on this page. */
  successHref: string;
  /** The same list one page back, used when the page was emptied. */
  previousPageHref: string;
  /** Number of rows currently rendered on this page. */
  pageCount: number;
}) {
  const t = useTranslations('Leads');
  const common = useTranslations('Common');
  const router = useRouter();
  const { selectedItems, clear } = useLeadSelection();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (selectedItems.length === 0) {
    return null;
  }

  async function handleDelete() {
    setError(null);
    setBusy(true);
    const result = await deleteLeads({ items: selectedItems });
    setBusy(false);

    if (!result.ok) {
      // The dialog stays open so the reason sits next to the decision.
      setError(
        result.error === 'unauthorized'
          ? common('errors.sessionExpired')
          : common('errors.deleteFailed')
      );
      return;
    }

    // Selecting the whole page and deleting it empties the page. Going back
    // one page is friendlier than landing on an empty page whose only content
    // is pagination. A skipped row means it was already gone, so the same
    // reasoning still holds.
    const emptiedPage =
      result.deleted > 0 && pageCount > 0 && selectedItems.length >= pageCount;
    const href = withDeleted(
      emptiedPage ? previousPageHref : successHref,
      result.deleted
    );

    clear();
    setOpen(false);
    router.push(href);
    router.refresh();
  }

  return (
    <>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-stone-200 bg-white/95 shadow-[0_-4px_12px_rgba(0,0,0,0.08)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <p
            role="status"
            aria-live="polite"
            className="text-sm font-medium text-stone-800"
          >
            {t('delete.selected', { count: selectedItems.length })}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                clear();
                setError(null);
              }}
            >
              {t('delete.clear')}
            </Button>
            <Button
              type="button"
              size="sm"
              className="bg-red-700 hover:bg-red-800 focus-visible:outline-red-700"
              onClick={() => {
                setError(null);
                setOpen(true);
              }}
            >
              <Icon name="trash" className="me-2 h-4 w-4" />
              {t('delete.bulkButton')}
            </Button>
          </div>
        </div>
      </div>
      <ConfirmDialog
        open={open}
        title={t('delete.title')}
        message={t('delete.confirmBulk', { count: selectedItems.length })}
        confirmLabel={t('delete.bulkButton')}
        cancelLabel={common('cancel')}
        busy={busy}
        busyLabel={common('deleting')}
        error={error}
        onConfirm={handleDelete}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
