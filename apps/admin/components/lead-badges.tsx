import type { ReactNode } from 'react';
import type { LeadStatus } from '@/lib/lead-status';
import type { LeadKind } from '@/lib/leads-query';

// Small status/type pills shared by the leads table, the phone cards and the
// detail page. Only the existing brand/stone scales are used, so the future
// dark-mode pass can restyle one palette rather than every surface.

type Tone = 'brand' | 'brandSoft' | 'stone';

const TONE_CLASSES: Record<Tone, string> = {
  brand: 'border-brand-200 bg-brand-100 text-brand-800',
  brandSoft: 'border-brand-200 bg-brand-50 text-brand-700',
  stone: 'border-stone-200 bg-stone-100 text-stone-700',
};

export function LeadBadge({
  children,
  tone = 'stone',
}: {
  children: ReactNode;
  tone?: Tone;
}) {
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-medium ${TONE_CLASSES[tone]}`}
    >
      {children}
    </span>
  );
}

export function leadKindTone(kind: LeadKind): Tone {
  if (kind === 'quote') return 'brand';
  if (kind === 'maintenance') return 'brandSoft';
  return 'stone';
}

export function leadStatusTone(status: LeadStatus): Tone {
  if (status === 'NEW') return 'brand';
  if (status === 'IN_PROGRESS') return 'brandSoft';
  return 'stone';
}
