import { Card } from '@colina/ui';
import { getLocale, getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import {
  auditEntityLabelKey,
  auditEntityType,
  auditEntrySentence,
} from '@/lib/audit-log-view';
import { intlLocale, relativeTime } from '@/lib/format';

// An audit entry flattened to the fields this panel shows. The admin email is
// resolved to `null` when the account was deleted, so the panel can fall back
// to the audit-log's own wording.
export type ActivityEntry = {
  id: string;
  action: string;
  entity: string;
  details: unknown;
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
  // The sentence builder, entity labels and "(deleted admin)" wording live
  // with the audit log and are reused here rather than duplicated.
  const audit = await getTranslations('AuditLog');
  const common = await getTranslations('Common');

  const entityLabel = (entity: string) => {
    const key = auditEntityLabelKey(entity);
    return key && audit.has(key as never)
      ? audit(key as never)
      : auditEntityType(entity);
  };

  return (
    <Card title={dashboard('recentActivityHeading')}>
      {entries.length === 0 ? (
        <p className="mt-2 text-sm text-stone-500">
          {dashboard('recentActivityEmpty')}
        </p>
      ) : (
        <>
          <ul className="mt-2">
            {entries.map((entry) => {
              // Exactly the audit-log page's resolution: a localized sentence
              // when the row carries a safe label, raw codes otherwise.
              const sentence = auditEntrySentence(
                entry.action,
                entry.details,
                locale
              );
              const when = relativeTime(entry.createdAt, locale);
              const fullTime = entry.createdAt.toLocaleString(
                intlLocale(locale)
              );

              return (
                <li
                  key={entry.id}
                  className="border-t border-stone-100 first:border-t-0"
                >
                  <Link
                    href={`/audit-log?action=${encodeURIComponent(entry.action)}`}
                    className="-mx-2 block rounded-lg px-2 py-3 hover:bg-stone-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
                  >
                    <p className="break-words font-semibold text-stone-900">
                      {sentence ? (
                        sentence.name ? (
                          audit(
                            `actions.${sentence.key}` as never,
                            {
                              name: sentence.name,
                            } as never
                          )
                        ) : (
                          audit(`actions.${sentence.key}` as never)
                        )
                      ) : (
                        <span className="font-mono text-sm">
                          {entry.action}{' '}
                          <span className="font-sans text-stone-500">
                            {entry.entity}
                          </span>
                        </span>
                      )}
                    </p>
                    <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-sm text-stone-500">
                      <span className="break-all">
                        {entry.adminEmail ?? audit('deletedAdmin')}
                      </span>
                      <span aria-hidden="true">{common('separator')}</span>
                      <time
                        dateTime={entry.createdAt.toISOString()}
                        title={fullTime}
                      >
                        {when ?? dashboard('justNow')}
                      </time>
                      <span aria-hidden="true">{common('separator')}</span>
                      <span>{entityLabel(entry.entity)}</span>
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 border-t border-stone-100 pt-3 text-sm">
            <Link
              href="/audit-log"
              className="font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
            >
              {dashboard('recentActivityViewAll')}
            </Link>
          </p>
        </>
      )}
    </Card>
  );
}
