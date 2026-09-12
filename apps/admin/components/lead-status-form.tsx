'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { updateLeadStatus } from '@/lib/actions/leads';

const STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;

type LeadStatusFormProps = {
  kind: 'contact' | 'maintenance';
  leadId: string;
  currentStatus: string;
};

export function LeadStatusForm({
  kind,
  leadId,
  currentStatus,
}: LeadStatusFormProps) {
  const router = useRouter();
  const [status, setStatus] = useState(currentStatus);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setBusy(true);
    const result = await updateLeadStatus({ kind, id: leadId, status });
    setBusy(false);
    if (result.ok) {
      router.refresh();
      return;
    }
    setError(
      result.error === 'unauthorized'
        ? 'Your session expired. Log in again.'
        : 'Updating failed. Try again.'
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex items-end gap-3">
      <div>
        <label
          htmlFor="lead-status"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          Status
        </label>
        <select
          id="lead-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
        >
          {STATUSES.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        Update status
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
