import type { ReactNode } from 'react';

// Small status pill for the agents list: whether an agent is on the public
// site. Only the existing brand/stone scales are used, mirroring the lead
// badges, so the later dark-mode stage restyles both together.
export function AgentStatusBadge({
  published,
  children,
}: {
  published: boolean;
  children: ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${published ? 'border-brand-200 bg-brand-50 text-brand-800' : 'border-stone-200 bg-stone-100 text-stone-700'}`}
    >
      {children}
    </span>
  );
}
