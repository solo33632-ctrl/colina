'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { deleteLead } from '@/lib/actions/leads';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icons';

// The detail page's destructive action. The list has its own confirmation and
// bulk bar; this one deletes exactly the record on screen and returns to the
// inbox with the same "deleted" marker the bulk path uses.
export function LeadDeleteButton({
  kind,
  id,
  itemName,
}: {
  kind: 'contact' | 'maintenance';
  id: string;
  /** Names the request in the dialog and the accessible label. */
  itemName: string;
}) {
  const t = useTranslations('Leads');
  const common = useTranslations('Common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setError(null);
    setBusy(true);
    const result = await deleteLead({ kind, id });
    setBusy(false);

    if (!result.ok) {
      setError(
        result.error === 'unauthorized'
          ? common('errors.sessionExpired')
          : common('errors.deleteFailed')
      );
      return;
    }

    router.push(`/leads?deleted=${result.deleted}`);
    router.refresh();
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        aria-label={t('delete.item', { name: itemName })}
        className="border-red-300 text-red-700 hover:bg-red-50"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        <Icon name="trash" className="me-2 h-4 w-4" />
        {t('delete.button')}
      </Button>
      <ConfirmDialog
        open={open}
        title={t('delete.title')}
        message={t('delete.confirmOne', { name: itemName })}
        confirmLabel={t('delete.button')}
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
