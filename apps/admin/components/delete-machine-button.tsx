'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icons';
import { deleteMachine } from '@/lib/actions/machines';

type DeleteMachineButtonProps = {
  machineId: string;
  /** Names the machine in the dialog and in the button's accessible name. */
  itemName: string;
  /** Small, unwrapped variant for the list table's actions column. */
  compact?: boolean;
};

export function DeleteMachineButton({
  machineId,
  itemName,
  compact = false,
}: DeleteMachineButtonProps) {
  const common = useTranslations('Common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setError(null);
    setBusy(true);
    const result = await deleteMachine(machineId);
    setBusy(false);
    if (result.ok) {
      router.push('/machines');
      router.refresh();
      return;
    }
    setError(
      result.error === 'unauthorized'
        ? common('errors.sessionExpired')
        : common('errors.deleteFailed')
    );
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        aria-label={common('deleteItem', { name: itemName })}
        onClick={() => setOpen(true)}
      >
        <Icon name="trash" className="me-2 h-4 w-4" />
        {common('delete')}
      </Button>
      <ConfirmDialog
        open={open}
        title={common('delete')}
        message={common('deleteNamed', { name: itemName })}
        confirmLabel={common('delete')}
        cancelLabel={common('cancel')}
        busy={busy}
        busyLabel={common('deleting')}
        error={error}
        onConfirm={onDelete}
        onClose={() => {
          setOpen(false);
          setError(null);
        }}
      />
    </>
  );
}
