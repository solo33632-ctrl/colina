import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { Button } from '@colina/ui';
import { Link } from '@/i18n/navigation';
import { inputClasses } from './form-fields';

// Search (and any extra filter) for a content list. A real GET form: the
// submitted query lands in the URL, so a filtered list is shareable, survives a
// reload and needs no client state.
export async function ListFilters({
  query,
  filtered,
  clearHref,
  label,
  placeholder,
  clearLabel,
  children,
}: {
  query: string;
  /** Whether a filter is active *and* there are still rows to clear back to.
   *  When nothing matches, the empty state renders its own "clear search"
   *  link, so this one is suppressed rather than duplicated. */
  filtered: boolean;
  clearHref: string;
  /** Overrides for lists whose search covers more than a name. */
  label?: string;
  placeholder?: string;
  clearLabel?: string;
  /** Extra controls, e.g. the machines category select. */
  children?: ReactNode;
}) {
  const common = await getTranslations('Common');

  return (
    <form method="get" className="mt-6 flex flex-wrap items-end gap-3">
      <div className="min-w-[12rem] flex-1 sm:max-w-xs">
        <label
          htmlFor="list-search"
          className="mb-1 block text-sm font-medium text-stone-700"
        >
          {label ?? common('search')}
        </label>
        <input
          id="list-search"
          name="q"
          type="search"
          defaultValue={query}
          placeholder={placeholder ?? common('searchPlaceholder')}
          className={inputClasses}
        />
      </div>
      {children}
      <Button type="submit" variant="secondary" size="sm">
        {common('search')}
      </Button>
      {filtered ? (
        <Link
          href={clearHref}
          className="rounded pb-2 text-sm font-medium text-brand-700 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        >
          {clearLabel ?? common('clearSearch')}
        </Link>
      ) : null}
    </form>
  );
}
