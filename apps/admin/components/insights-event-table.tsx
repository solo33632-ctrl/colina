import { getLocale, getTranslations } from 'next-intl/server';
import type { SecurityEventListRow } from '@colina/db';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { intlLocale } from '@/lib/format';
import { isSecurityEventType } from '@/lib/insights';

// The raw security events, newest first.
//
// The raw rows are here deliberately: an operator investigating a burst needs
// the exact timestamp, source, IP and detail to correlate with a hosting log,
// and translating the codes or rounding the times would defeat that. Labels
// come from the message files; the codes stay visible as they are stored.
export async function InsightsEventTable({
  events,
}: {
  events: SecurityEventListRow[];
}) {
  const locale = await getLocale();
  const t = await getTranslations('Insights');
  const common = await getTranslations('Common');
  const intl = intlLocale(locale);

  const typeLabel = (type: string) =>
    isSecurityEventType(type) ? t(`eventTypes.${type}`) : type;

  const columns: AdminTableColumn<SecurityEventListRow>[] = [
    {
      key: 'createdAt',
      header: t('timeColumn'),
      className: 'whitespace-nowrap',
      render: (row) => (
        <time dateTime={row.createdAt.toISOString()}>
          {row.createdAt.toLocaleString(intl)}
        </time>
      ),
    },
    {
      key: 'type',
      header: t('typeColumn'),
      render: (row) => (
        <span className="whitespace-nowrap font-medium text-stone-900">
          {typeLabel(row.type)}
        </span>
      ),
    },
    {
      key: 'source',
      header: t('sourceColumn'),
      className: 'hidden md:table-cell',
      render: (row) => (
        // Stored code, verbatim — the same reason as the audit log's action and
        // entity: an investigator matches it against the code, not a caption.
        <span className="font-mono text-xs text-stone-700">{row.source}</span>
      ),
    },
    {
      key: 'ip',
      header: t('ipColumn'),
      className: 'hidden md:table-cell',
      render: (row) =>
        row.ip ? (
          <span dir="ltr" className="font-mono text-xs text-stone-700">
            {row.ip}
          </span>
        ) : (
          <span className="text-stone-400">{common('none')}</span>
        ),
    },
    {
      key: 'detail',
      header: t('detailColumn'),
      render: (row) => (
        <span
          dir="ltr"
          title={row.detail ?? undefined}
          className="block max-w-[18rem] truncate text-xs text-stone-600"
        >
          {row.detail ?? common('none')}
        </span>
      ),
    },
  ];

  return (
    <AdminTable
      label={t('eventsHeading')}
      columns={columns}
      rows={events}
      rowKey={(row) => row.id}
    />
  );
}
