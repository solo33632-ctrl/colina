'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { deleteCategory } from '@/lib/actions/categories';

type DeleteCategoryButtonProps = {
  categoryId: string;
  machineCount: number;
};

export function DeleteCategoryButton({
  categoryId,
  machineCount,
}: DeleteCategoryButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (!window.confirm('Delete this category? This cannot be undone.')) {
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
        ? `Cannot delete: this category still has ${result.machineCount ?? machineCount} machine(s). Move or delete them first.`
        : 'Deleting failed. Try again.'
    );
  }

  return (
    <div className="mt-6">
      <Button variant="secondary" disabled={busy} onClick={onDelete}>
        Delete category
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
