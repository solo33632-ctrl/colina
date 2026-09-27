'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { updateLeadStatus } from '@/lib/actions/leads';
import { LEAD_STATUSES } from '@/lib/lead-status';

// The option values are the stored codes; the visible text comes from
// `Leads.statuses.*` (see `lib/lead-status.ts`).

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
  const t = useTranslations('Leads');
  const common = useTranslations('Common');
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
        ? common('errors.sessionExpired')
        : common('errors.updateFailed')
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 flex items-end gap-3">
      <div>
        <label
          htmlFor="lead-status"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {t('statusLabel')}
        </label>
        <select
          id="lead-status"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          className="rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900"
        >
          {LEAD_STATUSES.map((option) => (
            <option key={option} value={option}>
              {t(`statuses.${option}`)}
            </option>
          ))}
        </select>
      </div>
      <Button type="submit" size="sm" disabled={busy}>
        {t('updateStatus')}
      </Button>
      {error ? (
        <p role="alert" className="text-sm font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
