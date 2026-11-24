import type { ReactNode } from 'react';

// Stage 4e: the two small state pills the machines/categories lists share.
//
// Both use the semantic palette (brand/amber/stone) so the dark theme flips
// them with the rest of the panel. `PublishStatusBadge` is a warning colour
// for a draft and the brand tint for published; `EditorOriginBadge` is neutral
// so it does not compete with the status.
export function PublishStatusBadge({
  published,
  children,
}: {
  published: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${published ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-amber-300 bg-amber-50 text-amber-900'}`}
    >
      {children}
    </span>
  );
}

export function EditorOriginBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center whitespace-nowrap rounded-full border border-stone-200 bg-stone-100 px-2 py-0.5 text-xs font-medium text-stone-700">
      {children}
    </span>
  );
}
