import { getTranslations } from 'next-intl/server';
import { Button, Card } from '@colina/ui';
import { Link } from '@/i18n/navigation';

// What replaces the table when a list has no rows. Two situations, and they
// need different calls to action: nothing has been created yet (offer the
// create button) or a search/filter hid everything (offer the way back to the
// unfiltered list, not a create button — the records do exist).
export async function ListEmptyState({
  message,
  createHref,
  createLabel,
  clearHref,
}: {
  message: string;
  createHref?: string;
  createLabel?: string;
  clearHref?: string;
}) {
  const common = await getTranslations('Common');

  return (
    <Card className="mt-6">
      <div className="flex flex-col items-center gap-4 py-6 text-center">
        <p className="text-sm text-stone-600">{message}</p>
        {createHref && createLabel ? (
          <Button href={createHref} size="sm">
            {createLabel}
          </Button>
        ) : null}
        {clearHref ? (
          <Link
            href={clearHref}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {common('clearSearch')}
          </Link>
        ) : null}
      </div>
    </Card>
  );
}
