'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';

type DeleteButtonProps = {
  label?: string;
  confirmMessage: string;
  redirectTo: string;
  onDelete: () => Promise<{ ok: boolean; error?: string }>;
};

// Shared confirm-guarded delete for the simple content types (partners,
// services, news, agents). The category/machine buttons predate it and stay
// as they are — same behavior, no reason to churn them.
export function DeleteButton({
  label,
  confirmMessage,
  redirectTo,
  onDelete,
}: DeleteButtonProps) {
  const common = useTranslations('Common');
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
        ? common('errors.sessionExpired')
        : common('errors.deleteFailed')
    );
  }

  return (
    <div className="mt-6">
      <Button variant="secondary" disabled={busy} onClick={handleDelete}>
        {label ?? common('delete')}
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
