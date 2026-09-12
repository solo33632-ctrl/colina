'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@colina/ui';

type DeleteButtonProps = {
  label?: string;
  confirmMessage: string;
  redirectTo: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
};

// Shared confirm-guarded delete for the simple content types (partners,
// services, news, agents). Phase 10's category/machine buttons predate it
// and stay as they are — same behavior, no reason to churn them.
export function DeleteButton({
  label = 'Delete',
  confirmMessage,
  redirectTo,
  onDelete,
}: DeleteButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleDelete() {
    if (!window.confirm(confirmMessage)) {
      return;
    }
    setError(null);
    setBusy(true);
    const result = await onDelete();
    setBusy(false);
    if (result.ok) {
      router.push(redirectTo);
      router.refresh();
      return;
    }
    setError(
      result.error === 'unauthorized'
        ? 'Your session expired. Log in again.'
        : 'Deleting failed. Try again.'
    );
  }

  return (
    <div className="mt-6">
      <Button variant="secondary" disabled={busy} onClick={handleDelete}>
        {label}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
