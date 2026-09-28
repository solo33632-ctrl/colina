'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { deleteCategory } from '@/lib/actions/categories';

type DeleteCategoryButtonProps = {
  categoryId: string;
  machineCount: number;
  /** Small, unwrapped variant for the list table's actions column. */
  compact?: boolean;
};

export function DeleteCategoryButton({
  categoryId,
  machineCount,
  compact = false,
}: DeleteCategoryButtonProps) {
  const t = useTranslations('Categories');
  const common = useTranslations('Common');
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm(t('delete.confirm'))) {
      return;
    }
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
    <div className={compact ? '' : 'mt-6'}>
      <Button
        variant="secondary"
        size={compact ? 'sm' : 'md'}
        disabled={busy}
        onClick={onDelete}
      >
        {t('delete.button')}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
