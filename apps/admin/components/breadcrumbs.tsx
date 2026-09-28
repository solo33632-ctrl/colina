import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Icon } from './icons';

// "Section > Item" trail at the top of a create/edit page. The last crumb is
// the page's <h1>, so the trail doubles as the heading and the page keeps a
// single top-level title.
export async function Breadcrumbs({
  sectionHref,
  sectionLabel,
  current,
}: {
  sectionHref: string;
  sectionLabel: string;
  current: string;
}) {
  const common = await getTranslations('Common');

  return (
    <nav aria-label={common('breadcrumbLabel')}>
      <ol className="flex flex-wrap items-center gap-2">
        <li>
          <Link
            href={sectionHref}
            className="rounded text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
          >
            {sectionLabel}
          </Link>
        </li>
        <li aria-hidden="true" className="text-stone-400">
          {/* Pointing the other way in RTL, where the trail reads
              right-to-left. */}
          <Icon name="chevron" className="h-4 w-4 rtl:rotate-180" />
        </li>
        <li>
          <h1 aria-current="page" className="text-2xl font-bold text-stone-900">
            {current}
          </h1>
        </li>
      </ol>
    </nav>
  );
}
