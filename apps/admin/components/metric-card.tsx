import type { ReactNode } from 'react';

// One number on the insights dashboard: a translated label over a value.
//
// Deliberately not `StatCard`, which is a link to the section that *manages*
// the thing it counts. Nothing here is managed — a page view and a blocked
// submission are read-only facts with nowhere to go — so this tile has no
// `href` and does not pretend to be clickable.
//
// `value` is for the traffic tiles whose headline is not a plain count (a
// share, a date); `detail` carries the plain-language interpretation under it
// (the change against the previous period, the views on the busiest day).
export function MetricCard({
  label,
  count,
  value,
  detail,
  tone = 'neutral',
  testId,
}: {
  label: string;
  count: number;
  value?: ReactNode;
  detail?: ReactNode;
  /** `alert` is for the one number an operator is meant to notice: refused
   *  requests and rejected sign-ins are what this page exists to surface. */
  tone?: 'neutral' | 'alert';
  /** Stable hook for the e2e suite, which has to read a count off this tile.
   *  Positional selectors would break the moment a tile is added. */
  testId?: string;
}) {
  return (
    <div
      data-testid={testId}
      className={[
        'rounded-xl border p-4 shadow-sm',
        tone === 'alert'
          ? 'border-amber-300 bg-amber-50'
          : 'border-stone-200 bg-white',
      ].join(' ')}
    >
      <p
        className={[
          'text-sm font-medium leading-tight',
          tone === 'alert' ? 'text-amber-900' : 'text-stone-600',
        ].join(' ')}
      >
        {label}
      </p>
      <div
        data-testid={testId ? `${testId}-value` : undefined}
        className={[
          'mt-2 text-2xl font-bold tabular-nums',
          tone === 'alert' ? 'text-amber-900' : 'text-stone-900',
        ].join(' ')}
      >
        {value ?? count.toLocaleString()}
      </div>
      {detail ? (
        <div
          data-testid={testId ? `${testId}-detail` : undefined}
          className="mt-1 text-xs"
        >
          {detail}
        </div>
      ) : null}
    </div>
  );
}
