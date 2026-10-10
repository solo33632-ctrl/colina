import type { ReactNode } from 'react';
import { Link } from '@/i18n/navigation';

export type BreadcrumbItem = {
  label: ReactNode;
  /** Omit on the last item: the current page is not a link. */
  href?: string;
};

type BreadcrumbProps = {
  items: BreadcrumbItem[];
  /** Accessible name for the nav landmark, e.g. "Breadcrumb". */
  label: string;
};

/**
 * A "Home / Category" trail above a page heading.
 *
 * Separators are drawn with `::before` content and `aria-hidden`, not typed
 * into the DOM as "/" characters, so a screen reader announces the item names
 * and not the punctuation. They are separate flex items, so they follow the
 * page's own `dir` and read right-to-left on the Arabic pages without any
 * mirroring logic.
 *
 * The last item is marked `aria-current="page"` and is not a link.
 */
export function Breadcrumb({ items, label }: BreadcrumbProps) {
  return (
    <nav aria-label={label}>
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-stone-500">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={index} className="flex items-center gap-2">
              {index > 0 ? (
                <span aria-hidden="true" className="text-stone-300">
                  /
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href as never}
                  className="font-medium text-brand-700 hover:text-brand-800"
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  aria-current={isLast ? 'page' : undefined}
                  className="text-stone-700"
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
