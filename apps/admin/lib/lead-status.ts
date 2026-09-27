// Lead status codes.
//
// These are the values stored in the column, accepted by the Server Action
// and carried by the `?status=` filter — they are never displayed. The
// visible label for each comes from the `Leads.statuses.*` message keys, so
// the codes live here once and the translation lives in the message files.
export const LEAD_STATUSES = ['NEW', 'IN_PROGRESS', 'RESOLVED'] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];

export function isLeadStatus(value: string): value is LeadStatus {
  return (LEAD_STATUSES as readonly string[]).includes(value);
}
