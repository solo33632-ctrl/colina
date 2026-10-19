import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from './prisma/generated/client';

// Shared typed Prisma client singleton (standard Next.js + Prisma pattern).
//
// A fresh `PrismaClient` per import exhausts PostgreSQL connections under
// Next.js dev (HMR re-evaluates modules), so the instance is cached on
// `globalThis` in non-production and reused across reloads. Auth, validation,
// and rate limiting land in later phases — this module only owns the client.
//
// Requires `DATABASE_URL` (see `.env.example`). Never commit real values.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Shared row types for read-only Server Components (Phase 4+) and the
// admin auth layer (Phase 9+).
export type {
  AdminUser,
  Machine,
  MachineCategory,
  MachineImage,
  PageViewDaily,
  Partner,
} from './prisma/generated/client';
export type { AdminRole, SecurityEventType } from './prisma/generated/client';

// Security/abuse event logging (Phase 21a). Re-exported here so both apps
// reach the client, the row types and the event writer through the one
// `@colina/db` import they already use.
export { logSecurityEvent } from './security-events';
export type { SecurityEventInput } from './security-events';

// Privacy-respecting page-view counting (Phase 21b). Same shape as the event
// writer above and for the same reason: one implementation, shared, best-effort.
export { recordPageView, utcDayKey } from './page-views';
export type {
  DailyViews,
  DayRange,
  RecordPageViewResult,
  TopPageViews,
} from './page-views';

// Read side for the admin insights dashboard (Phase 21c). Aggregated in SQL by
// the same modules that own the writes, so the queries that read the
// unbounded tables live next to the ones that append to them.
export {
  countSecurityEventsByType,
  listSecurityEvents,
} from './security-events';
export type {
  SecurityEventListRow,
  SecurityEventPage,
  SecurityEventRange,
} from './security-events';
export { pageViewDailySeries, pageViewTotal, topPageViews } from './page-views';

// FEATURED_MACHINES_LIMIT used to live here, shared between the home page's
// query and the admin form's hint so the two could not quote different numbers.
// Both halves went when the home page's featured strip was removed, and the
// `Machine.featured` column is deliberately left in the schema for a future
// decision — so nothing is left to agree on, and a constant that documented a
// strip that no longer exists would only be a lie.
