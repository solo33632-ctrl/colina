import { getLocale, getTranslations } from 'next-intl/server';
import type { TopPageViews } from '@colina/db';
import { AdminTable, type AdminTableColumn } from '@/components/admin-table';
import { routing } from '@/i18n/routing';
import { intlLocale } from '@/lib/format';

type Locale = (typeof routing.locales)[number];

// The busiest paths in the selected window, with the language split the schema
// keeps for exactly this reason.
//
// The paths are the site-internal, locale-agnostic routes (`/`, `/privacy`,
// `/machines/colina-pack-s`) — the column a reader recognises from the URL bar,
// with the locale as its own column rather than baked into the string.
export async function InsightsTopPages({ pages }: { pages: TopPageViews[] }) {
  const locale = await getLocale();
  const t = await getTranslations('Insights');
  const intl = intlLocale(locale as Locale);

  const columns: AdminTableColumn<TopPageViews>[] = [
    {
      key: 'path',
      header: t('pathColumn'),
      render: (row) => (
        // Verbatim route, in code style: it is a path, not prose, and the
        // admin's job is to match it against the address bar or the sitemap.
        <span
          dir="ltr"
          className="block max-w-[22rem] truncate font-mono text-xs text-stone-900"
        >
          {row.path}
        </span>
      ),
    },
    ...routing.locales.map((code) => ({
      key: `locale-${code}`,
      header: t('localeColumn', { locale: code }),
      className: 'hidden sm:table-cell',
      render: (row: TopPageViews) => (
        <span className="tabular-nums">
          {(row.byLocale[code] ?? 0).toLocaleString(intl)}
        </span>
      ),
    })),
    {
      key: 'total',
      header: t('viewsColumn'),
      className: 'text-end',
      render: (row) => (
        <span className="font-semibold tabular-nums text-stone-900">
          {row.total.toLocaleString(intl)}
        </span>
      ),
    },
  ];

  return (
    <AdminTable
      label={t('topPagesHeading')}
      columns={columns}
      rows={pages}
      rowKey={(row) => row.path}
    />
  );
}
