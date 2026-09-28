import { Card } from '@colina/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { intlLocale } from '@/lib/format';

// An audit entry flattened to the fields this panel shows. The admin email is
// resolved to `null` when the account was deleted, so the panel can fall back
// to the audit-log's own wording.
export type ActivityEntry = {
  id: string;
  action: string;
  entity: string;
  createdAt: Date;
  adminEmail: string | null;
};

// Dashboard summary of the audit trail. Only ever rendered for super admins —
// the page decides that, using the same gate as the audit log itself.
export async function RecentActivityPanel({
  entries,
}: {
  entries: ActivityEntry[];
}) {
  const locale = await getLocale();
  const dashboard = await getTranslations('Dashboard');
  // The "(deleted admin)" wording lives with the audit log and is reused here
  // rather than duplicated in the messages.
  const audit = await getTranslations('AuditLog');
  const common = await getTranslations('Common');

  return (
    <Card title={dashboard('recentActivityHeading')}>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">
          {dashboard('recentActivityEmpty')}
        </p>
      ) : (
        <ul className="mt-2">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className="border-t border-stone-100 px-2 py-3 first:border-t-0"
            >
              <p className="font-semibold text-stone-900">
                {/* Stored codes, deliberately verbatim: the action and entity
                    are an audit trail, and an operator matching them against
                    the database needs them exact. */}
                {entry.action}{' '}
                <span className="font-normal text-stone-500">
                  {entry.entity}
                </span>
              </p>
              <p className="mt-1 text-sm text-stone-500">
                {entry.adminEmail ?? audit('deletedAdmin')}
                {common('separator')}
                <time dateTime={entry.createdAt.toISOString()}>
                  {entry.createdAt.toLocaleString(intlLocale(locale))}
                </time>
              </p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
