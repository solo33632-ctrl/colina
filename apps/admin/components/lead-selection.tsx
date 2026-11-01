'use client';

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { LeadDeleteTarget } from '@/lib/leads-delete';

// Selection state for the leads list. The page stays a Server Component: it
// fetches and renders the rows, then hands this provider their identities.
// Checkboxes and the bulk bar are the only client pieces, so the table and
// card markup keep rendering on the server.
//
// Selection is page-scoped on purpose. Checking a row, changing page and
// coming back must not leave an invisible selection behind, and the bulk bar
// only ever acts on rows the user can currently see.

const LeadSelectionContext = createContext<{
  pageItems: LeadDeleteTarget[];
  selectedItems: LeadDeleteTarget[];
  isSelected: (target: LeadDeleteTarget) => boolean;
  toggle: (target: LeadDeleteTarget) => void;
  selectAll: () => void;
  clear: () => void;
  selectAllState: 'none' | 'some' | 'all';
} | null>(null);

export function leadSelectionKey(target: LeadDeleteTarget): string {
  return `${target.kind}:${target.id}`;
}

export function LeadSelectionProvider({
  pageItems,
  children,
}: {
  /** Every row currently rendered, in display order. */
  pageItems: LeadDeleteTarget[];
  children: ReactNode;
}) {
  const [selection, setSelection] = useState<{
    /** Key list the selection was made against. */
    pageKeys: string;
    selected: ReadonlySet<string>;
  }>(() => ({
    pageKeys: pageItems.map(leadSelectionKey).join('|'),
    selected: new Set(),
  }));

  // A new page (or a refreshed page with different rows) starts clean even if
  // the client component instance survives the navigation. Adjusting the
  // state while rendering (React's documented pattern for "state that depends
  // on props") keeps the reset synchronous with the new page markup.
  const pageKeys = pageItems.map(leadSelectionKey).join('|');
  if (selection.pageKeys !== pageKeys) {
    setSelection({ pageKeys, selected: new Set() });
  }
  const selectedKeys = selection.selected;

  const isSelected = useCallback(
    (target: LeadDeleteTarget) => selectedKeys.has(leadSelectionKey(target)),
    [selectedKeys]
  );

  const toggle = useCallback((target: LeadDeleteTarget) => {
    const key = leadSelectionKey(target);
    setSelection((current) => {
      const next = new Set(current.selected);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return { ...current, selected: next };
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelection((current) => ({
      ...current,
      selected: new Set(pageItems.map(leadSelectionKey)),
    }));
  }, [pageItems]);

  const clear = useCallback(() => {
    setSelection((current) => ({ ...current, selected: new Set() }));
  }, []);

  const selectedItems = useMemo(
    () => pageItems.filter((item) => selectedKeys.has(leadSelectionKey(item))),
    [pageItems, selectedKeys]
  );

  const selectAllState: 'none' | 'some' | 'all' =
    pageItems.length > 0 && selectedItems.length === pageItems.length
      ? 'all'
      : selectedItems.length > 0
        ? 'some'
        : 'none';

  const value = useMemo(
    () => ({
      pageItems,
      selectedItems,
      isSelected,
      toggle,
      selectAll,
      clear,
      selectAllState,
    }),
    [
      pageItems,
      selectedItems,
      isSelected,
      toggle,
      selectAll,
      clear,
      selectAllState,
    ]
  );

  return (
    <LeadSelectionContext.Provider value={value}>
      {children}
    </LeadSelectionContext.Provider>
  );
}

export function useLeadSelection() {
  const context = useContext(LeadSelectionContext);
  if (!context) {
    throw new Error('useLeadSelection must be used inside LeadSelectionProvider');
  }
  return context;
}
