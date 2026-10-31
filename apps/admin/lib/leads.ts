import { prisma } from '@colina/db';
import {
  countLeadRows,
  filterLeadRows,
  leadDateRange,
  paginateLeadRows,
  toLeadRows,
  type LeadListFilters,
  type LeadPage,
  type LeadType,
} from './leads-query';

export type LeadQueryResult = LeadPage & {
  /** Counts after every active filter except the type tab itself. */
  counts: Record<LeadType, number>;
};

/**
 * The two lead tables, filtered in SQL and merged newest-first in memory.
 *
 * The inbox is a small, human-scale queue (the existing page made the same
 * trade-off), and one merged list cannot be paginated correctly by two
 * independent `skip`/`take` queries. Status, free-text and date filters narrow
 * both reads; the type tab is applied after the merge because "quote" is
 * derived from `machineModel` rather than stored as its own column.
 */
export async function queryLeads(
  filters: LeadListFilters
): Promise<LeadQueryResult> {
  const range = leadDateRange(filters);
  const createdAt =
    range.gte || range.lt
      ? {
          ...(range.gte ? { gte: range.gte } : {}),
          ...(range.lt ? { lt: range.lt } : {}),
        }
      : undefined;
  const query = filters.query;

  const [contacts, requests, machines] = await Promise.all([
    prisma.contactMessage.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                { email: { contains: query, mode: 'insensitive' as const } },
                { phone: { contains: query, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.maintenanceRequest.findMany({
      where: {
        ...(filters.status ? { status: filters.status } : {}),
        ...(createdAt ? { createdAt } : {}),
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: 'insensitive' as const } },
                {
                  company: {
                    contains: query,
                    mode: 'insensitive' as const,
                  },
                },
                { phone: { contains: query, mode: 'insensitive' as const } },
                { email: { contains: query, mode: 'insensitive' as const } },
                {
                  machineModel: {
                    contains: query,
                    mode: 'insensitive' as const,
                  },
                },
              ],
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.machine.findMany({ select: { slug: true } }),
  ]);

  const knownMachineSlugs = new Set(machines.map((machine) => machine.slug));
  const rows = toLeadRows(contacts, requests, knownMachineSlugs);
  const counts = countLeadRows(rows);
  const page = paginateLeadRows(
    filterLeadRows(rows, filters.type),
    filters.page
  );

  return { ...page, counts };
}
