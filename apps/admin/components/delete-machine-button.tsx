'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { deleteMachine } from '@/lib/actions/machines';

type DeleteMachineButtonProps = {
  machineId: string;
};

export function DeleteMachineButton({ machineId }: DeleteMachineButtonProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onDelete() {
    if (
      !window.confirm(
        'Delete this machine with all its images? This cannot be undone.'
      )
    ) {
      return;
    }
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
        ? 'Your session expired. Log in again.'
        : 'Deleting failed. Try again.'
    );
  }

  return (
    <div className="mt-6">
      <Button variant="secondary" disabled={busy} onClick={onDelete}>
        Delete machine
      </Button>
      {error ? (
        <p role="alert" className="mt-2 text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
