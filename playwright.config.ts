import { defineConfig } from '@playwright/test';

// End-to-end suite covering both apps (single suite on purpose: the CRUD
// flow asserts public-site effects of admin actions). One worker: the
// contact endpoint is rate-limited per IP and every spec hits localhost,
// so serial runs stay deterministic. No CI wiring (no CI exists yet).
//
// Prerequisites before `npm run test:e2e` (same chain as every prior
// phase's live verification):
//   1. Local Postgres up, migrated + seeded (packages/db README).
//   2. Both apps built (`npm run build`) and serving:
//        WEB_URL  (default http://localhost:3120)  -> apps/web
//        ADMIN_URL (default http://localhost:3121) -> apps/admin
//   3. ADMIN_PASSWORD set (the seeded admin's password for this run).
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
  },
});
