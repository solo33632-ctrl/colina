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
  Partner,
} from './prisma/generated/client';
export type { AdminRole } from './prisma/generated/client';

/**
 * How many featured machines the public home page actually renders.
 *
 * Shared so the query's `take` and the admin form's explanatory hint cannot
 * drift apart — the admin is told this exact number, so if the two disagreed
 * the hint would be a lie.
 *
 * Six fills the home page's `lg:grid-cols-3` grid as two clean rows. There is
 * deliberately no database constraint on how many machines may be flagged:
 * featuring more than this is allowed, and the ones past the limit simply do
 * not appear, which is why the admin form states the rule rather than blocking
 * the save.
 */
export const FEATURED_MACHINES_LIMIT = 6;
