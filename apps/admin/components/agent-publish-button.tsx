'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { Button } from '@colina/ui';
import { useRouter } from '@/i18n/navigation';
import { setAgentPublished } from '@/lib/actions/agents';

// Row action that flips an agent's visibility switch without opening the
// whole form. The visible label names the action it will perform ("Hide" on
// a published row, "Publish" on a hidden one), and the accessible name adds
// the agent, since the list renders one of these per row. A server-rendered
// table row cannot pass handlers down, so the component owns its request:
// on success `router.refresh()` re-renders the row with the new badge.
export function AgentPublishButton({
  agentId,
  published,
  agentName,
}: {
  agentId: string;
  published: boolean;
  agentName: string;
}) {
  const t = useTranslations('Agents');
  const common = useTranslations('Common');
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    setError(null);
    setBusy(true);
    const result = await setAgentPublished(agentId, !published);
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
    <div className="flex flex-col items-end gap-1">
      <Button
        type="button"
        variant="secondary"
        size="sm"
        disabled={busy}
        aria-label={
          published
            ? t('list.hideNamed', { name: agentName })
            : t('list.publishNamed', { name: agentName })
        }
        onClick={() => {
          void toggle();
        }}
      >
        {published ? t('list.hide') : t('list.publish')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs font-medium text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
