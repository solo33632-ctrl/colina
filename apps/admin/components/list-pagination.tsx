import { getTranslations } from 'next-intl/server';
import { Link } from '@/i18n/navigation';

// `?page=` pagination for the lists that can realistically grow. Same shape as
// the leads inbox and the audit log: previous/next links around a "page X of
// Y" counter, rendered only when there is more than one page, so a short list
// stays uncluttered.
export async function ListPagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  /** Page-aware href; the page passes one that keeps the active filters. */
  buildHref: (page: number) => string;
}) {
  const common = await getTranslations('Common');

  if (totalPages <= 1) {
    return null;
  }

  return (
    <nav
      aria-label={common('pagesLabel')}
      className="mt-6 flex items-center justify-center gap-4"
    >
      {page > 1 ? (
        <Link
          href={buildHref(page - 1)}
          className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {common('previous')}
        </Link>
      ) : null}
      <span className="text-sm text-stone-500">
        {common('pageOf', { current: page, total: totalPages })}
      </span>
      {page < totalPages ? (
        <Link
          href={buildHref(page + 1)}
          className="rounded text-sm font-medium text-brand-700 hover:text-brand-800"
        >
          {common('next')}
        </Link>
      ) : null}
    </nav>
  );
}
