'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { ConfirmDialog } from './confirm-dialog';
import { Icon } from './icons';
import { deleteCategory } from '@/lib/actions/categories';

type DeleteCategoryButtonProps = {
  categoryId: string;
  machineCount: number;
  /** Names the category in the dialog and in the button's accessible name. */
  itemName: string;
  /** Small, unwrapped variant for the list table's actions column. */
  compact?: boolean;
};

export function DeleteCategoryButton({
  categoryId,
  machineCount,
  itemName,
  compact = false,
}: DeleteCategoryButtonProps) {
  const t = useTranslations('Categories');
  const common = useTranslations('Common');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    setError(null);
    setBusy(true);
    const result = await deleteCategory(categoryId);
    setBusy(false);
    if (result.ok) {
      router.push('/categories');
      router.refresh();
      return;
    }
    setError(
      result.error === 'has_machines'
        ? t('delete.hasMachines', {
            count: result.machineCount ?? machineCount,
          })
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
