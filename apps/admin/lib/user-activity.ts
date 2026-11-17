import { prisma } from '@colina/db';
import { auditEntityType } from './audit-log-view';

// Stage 4b: the per-user activity page links each audit row back to the record
// it touched, but only when that record still exists. Audit rows are
// snapshots — the entity string must be resolved against the live tables on
// every render, never trusted as a working link.

export const USER_ACTIVITY_PAGE_SIZE = 20;

export type ActivityEntity =
  | { kind: 'linked'; href: string }
  | { kind: 'missing' }
  /** Entity kinds with no admin page (uploads, lead batches). */
  | { kind: 'unlinked' };

const LINKABLE_TYPES: ReadonlySet<string> = new Set([
  'Machine',
  'MachineCategory',
  'NewsPost',
  'MaintenanceCategory',
  'MaintenanceService',
  'MaintenanceShowcase',
  'Agent',
  'Partner',
  'AdminUser',
]);

export async function resolveActivityEntities(
  entities: string[]
): Promise<Map<string, ActivityEntity>> {
  const identifiers = new Map<string, Set<string>>();
  for (const entity of entities) {
    const separator = entity.indexOf(':');
    if (separator < 0) {
      continue;
    }
    const type = auditEntityType(entity);
    const identifier = entity.slice(separator + 1);
    if (identifier === '') {
      continue;
    }
    const set = identifiers.get(type) ?? new Set<string>();
    set.add(identifier);
    identifiers.set(type, set);
  }

  const values = (type: string) => [...(identifiers.get(type) ?? [])];
  const lookups = new Map<string, string>();

  const [machines, categories, news, maintenanceCategories, services] =
    await Promise.all([
      identifiers.has('Machine')
        ? prisma.machine.findMany({
            where: { slug: { in: values('Machine') } },
            select: { id: true, slug: true },
          })
        : [],
      identifiers.has('MachineCategory')
        ? prisma.machineCategory.findMany({
            where: { slug: { in: values('MachineCategory') } },
            select: { id: true, slug: true },
          })
        : [],
      identifiers.has('NewsPost')
        ? prisma.newsPost.findMany({
            where: { slug: { in: values('NewsPost') } },
            select: { id: true, slug: true },
          })
        : [],
      identifiers.has('MaintenanceCategory')
        ? prisma.maintenanceCategory.findMany({
            where: { slug: { in: values('MaintenanceCategory') } },
            select: { id: true, slug: true },
          })
        : [],
      identifiers.has('MaintenanceService')
        ? prisma.maintenanceService.findMany({
            where: { slug: { in: values('MaintenanceService') } },
            select: { id: true, slug: true },
          })
        : [],
    ]);

  for (const row of machines) {
    lookups.set(`Machine:${row.slug}`, `/machines/${row.id}/edit`);
  }
  for (const row of categories) {
    lookups.set(`MachineCategory:${row.slug}`, `/categories/${row.id}/edit`);
  }
  for (const row of news) {
    lookups.set(`NewsPost:${row.slug}`, `/news/${row.id}/edit`);
  }
  for (const row of maintenanceCategories) {
    lookups.set(
      `MaintenanceCategory:${row.slug}`,
      `/maintenance-categories/${row.id}/edit`
    );
  }
  for (const row of services) {
    lookups.set(`MaintenanceService:${row.slug}`, `/services/${row.id}/edit`);
  }

  const [agents, partners, showcases, admins] = await Promise.all([
    identifiers.has('Agent')
      ? prisma.agent.findMany({
          where: { id: { in: values('Agent') } },
          select: { id: true },
        })
      : [],
    identifiers.has('Partner')
      ? prisma.partner.findMany({
          where: { id: { in: values('Partner') } },
          select: { id: true },
        })
      : [],
    identifiers.has('MaintenanceShowcase')
      ? prisma.maintenanceShowcase.findMany({
          where: { id: { in: values('MaintenanceShowcase') } },
          select: { id: true },
        })
      : [],
    identifiers.has('AdminUser')
      ? prisma.adminUser.findMany({
          where: { id: { in: values('AdminUser') } },
          select: { id: true },
        })
      : [],
  ]);

  for (const row of agents) {
    lookups.set(`Agent:${row.id}`, `/agents/${row.id}/edit`);
  }
  for (const row of partners) {
    lookups.set(`Partner:${row.id}`, `/partners/${row.id}/edit`);
  }
  for (const row of showcases) {
    lookups.set(
      `MaintenanceShowcase:${row.id}`,
      `/maintenance-showcase/${row.id}/edit`
    );
  }
  for (const row of admins) {
    lookups.set(`AdminUser:${row.id}`, `/users/${row.id}`);
  }

  const resolved = new Map<string, ActivityEntity>();
  for (const entity of entities) {
    const type = auditEntityType(entity);
    if (type === 'SiteSettings') {
      resolved.set(entity, { kind: 'linked', href: '/settings' });
      continue;
    }
    if (!LINKABLE_TYPES.has(type)) {
      resolved.set(entity, { kind: 'unlinked' });
      continue;
    }
    const href = lookups.get(entity);
    resolved.set(entity, href ? { kind: 'linked', href } : { kind: 'missing' });
  }

  return resolved;
}
