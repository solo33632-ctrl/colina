'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icons';

type DeleteButtonProps = {
  /** Names the record in the dialog and in the button's accessible name. */
  itemName: string;
  redirectTo: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
  /** Extra wording for a specific failure, e.g. a category still in use. */
  errorFor?: (error: string) => string | null;
  /** Small, unwrapped variant used inside a list table's actions column. */
  compact?: boolean;
};

// Shared confirm-guarded delete for the simple content types (partners,
// services, news, agents). The category/machine buttons predate it and stay
// as they are — same behavior, no reason to churn them.
//
// The confirmation is a native <dialog> rather than window.confirm: it can
// name the record, carry a translated failure, and be styled like the rest of
// the panel, while the platform keeps the focus trap and the Escape handling.
export function DeleteButton({
  itemName,
  redirectTo,
  onDelete,
  errorFor,
  compact = false,
}: DeleteButtonProps) {
  const t = useTranslations('Common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    const result = await onDelete();
    setBusy(false);
    if (result.ok) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    // The dialog stays open on failure: the user is in the middle of a
    // decision and the reason it did not go through belongs there.
    setError(
      (result.error ? errorFor?.(result.error) : null) ??
        (result.error === 'unauthorized'
          ? t('errors.sessionExpired')
          : t('errors.deleteFailed'))
    );
  }

  return (
    <>
      {/* The edit pages render this under the form and rely on the margin it
          had before it became a row action in the list tables. */}
      <div className={compact ? '' : 'mt-6'}>
        <Button
          type="button"
          variant="secondary"
          size={compact ? 'sm' : 'md'}
          // The visible label is the generic "Delete" plus the icon; the
          // accessible name says which record, since a list has one of these per
          // row.
          aria-label={t('deleteItem', { name: itemName })}
          onClick={() => setOpen(true)}
        >
          <Icon name="trash" className="me-2 h-4 w-4" />
          {t('delete')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        title={t('delete')}
        message={t('deleteNamed', { name: itemName })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        busy={busy}
        busyLabel={t('deleting')}
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
