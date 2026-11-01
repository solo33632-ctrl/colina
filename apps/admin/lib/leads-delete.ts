// Pure helpers for deleting leads.
//
// Kept out of the `'use server'` module because Next requires that file to
// export only async actions, and because the audit string is worth testing on
// its own: it must carry enough to reconstruct what was deleted (kind, id,
// received date, counts) while never naming the visitor or quoting their
// message.

export type LeadDeleteTarget = {
  kind: 'contact' | 'maintenance';
  id: string;
};

export type FoundLead = LeadDeleteTarget & {
  receivedAt: Date;
};

/**
 * One audit `entity` value per delete call.
 *
 * Requested targets are listed in order. Each carries its received timestamp
 * when the row existed, or the literal `skipped` when it was already gone, so
 * a repeated call is visible as a no-op rather than a second deletion. Only
 * ids, dates and counts appear here — never a name, phone, email or message.
 */
export function leadDeleteAuditEntity(input: {
  requested: LeadDeleteTarget[];
  found: FoundLead[];
  deleted: number;
}): string {
  const received = new Map(
    input.found.map((row) => [
      `${row.kind}:${row.id}`,
      row.receivedAt.toISOString(),
    ])
  );
  const items = input.requested.map(
    (target) =>
      `${target.kind}:${target.id}@${
        received.get(`${target.kind}:${target.id}`) ?? 'skipped'
      }`
  );
  const skipped = Math.max(0, input.requested.length - input.deleted);
  return [
    'Lead',
    `requested=${input.requested.length}`,
    `deleted=${input.deleted}`,
    `skipped=${skipped}`,
    `items=${items.join(',')}`,
  ].join(' ');
}
