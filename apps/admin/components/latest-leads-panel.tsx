import { Card } from '@colina/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { relativeTime } from '@/lib/format';
import { isLeadStatus } from '@/lib/lead-status';

// A lead from either lead table, flattened to the fields this panel shows.
export type LatestLead = {
  id: string;
  kind: 'contact' | 'maintenance';
  name: string;
  status: string;
  createdAt: Date;
};

// Dashboard summary of the newest submissions, each row linking to the same
// detail view the leads inbox links to.
export async function LatestLeadsPanel({ leads }: { leads: LatestLead[] }) {
  const locale = await getLocale();
  const t = await getTranslations('Leads');
  const dashboard = await getTranslations('Dashboard');
  const common = await getTranslations('Common');

  return (
    <Card title={dashboard('latestLeadsHeading')}>
      {leads.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">
          {dashboard('latestLeadsEmpty')}
        </p>
      ) : (
        <ul className="mt-2">
          {leads.map((lead) => {
            const when = relativeTime(lead.createdAt, locale);
            return (
              <li
                key={`${lead.kind}-${lead.id}`}
                className="border-t border-stone-100 first:border-t-0"
              >
                <Link
                  href={`/leads/${lead.kind}/${lead.id}`}
                  className="-mx-2 block rounded-lg px-2 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                >
                  <p className="truncate font-medium text-stone-900">
                    {lead.name}
                  </p>
                  <p className="mt-1 text-sm text-stone-500">
                    <span className="me-1 inline-block rounded bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-600">
                      {t(`kinds.${lead.kind}`)}
                    </span>
                    {/* A status read back from the enum column is always one of
                        the known codes; the guard holds and the raw value is a
                        defensive fallback, as in the leads inbox. */}
                    {isLeadStatus(lead.status)
                      ? t(`statuses.${lead.status}`)
                      : lead.status}
                    {common('separator')}
                    <time dateTime={lead.createdAt.toISOString()}>
                      {when ?? dashboard('justNow')}
                    </time>
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
