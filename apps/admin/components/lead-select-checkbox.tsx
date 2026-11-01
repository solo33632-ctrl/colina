'use client';

import { useEffect, useRef } from 'react';
import type { LeadDeleteTarget } from '@/lib/leads-delete';
import { useLeadSelection } from './lead-selection';

const checkboxClasses =
  'h-4 w-4 shrink-0 cursor-pointer rounded border-stone-400 accent-brand-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600';

// One checkbox per row. The visible table has no room for a per-row label, so
// the accessible name names the request; that is also what Playwright and
// screen-reader users see.
export function LeadRowCheckbox({
  target,
  label,
}: {
  target: LeadDeleteTarget;
  label: string;
}) {
  const { isSelected, toggle } = useLeadSelection();

  return (
    <input
      type="checkbox"
      checked={isSelected(target)}
      onChange={() => toggle(target)}
      aria-label={label}
      className={checkboxClasses}
    />
  );
}

// The select-all checkbox reflects three states: nothing selected, some of the
// page selected (indeterminate) and the whole page selected. The native
// `indeterminate` flag is a DOM property, not an attribute, so it has to be
// set through a ref.
export function LeadSelectAll({
  label,
  showLabel = false,
}: {
  label: string;
  /** The mobile toolbar has room to spell the label out next to the box. */
  showLabel?: boolean;
}) {
  const { selectAll, clear, selectAllState } = useLeadSelection();
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = selectAllState === 'some';
    }
  }, [selectAllState]);

  const all = selectAllState === 'all';

  return (
    <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-stone-700">
      <input
        ref={ref}
        type="checkbox"
        checked={all}
        onChange={() => (all ? clear() : selectAll())}
        aria-label={label}
        className={checkboxClasses}
      />
      {showLabel ? <span>{label}</span> : null}
    </label>
  );
}
