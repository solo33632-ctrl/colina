// One number on the insights dashboard: a translated label over a count.
//
// Deliberately not `StatCard`, which is a link to the section that *manages*
// the thing it counts. Nothing here is managed — a page view and a blocked
// submission are read-only facts with nowhere to go — so this tile has no
// `href` and does not pretend to be clickable.
export function MetricCard({
  label,
  count,
  tone = 'neutral',
  testId,
}: {
  label: string;
  count: number;
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
      <p
        className={[
          'mt-2 text-2xl font-bold tabular-nums',
          tone === 'alert' ? 'text-amber-900' : 'text-stone-900',
        ].join(' ')}
      >
        {count.toLocaleString()}
      </p>
    </div>
  );
}
