import { Link } from '@/i18n/navigation';

/**
 * The dark pill under a home category grid, shown only when the section has
 * more tiles than it displays.
 *
 * It is a real localized link, not a button: it navigates to the full index,
 * so it must work with middle-click, open-in-new-tab and without JavaScript.
 * The arrow is drawn pointing right and mirrored under `dir="rtl"` so
 * "forward" follows the reading direction in both locales.
 */
export function ViewAllLink({ href, label }: { href: string; label: string }) {
  return (
    <div className="mt-10 text-center">
      <Link
        href={href}
        className="inline-flex items-center gap-3 rounded-full bg-stone-700 px-8 py-3 text-sm font-medium text-white shadow-md transition-[transform,background-color] duration-300 ease-out hover:bg-stone-800 motion-safe:hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        {label}
        <svg
          aria-hidden="true"
          focusable="false"
          data-testid="view-all-arrow"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.8}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4 w-4 shrink-0 rtl:[transform:scaleX(-1)]"
        >
          <path d="M4 12h15" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </Link>
    </div>
  );
}
