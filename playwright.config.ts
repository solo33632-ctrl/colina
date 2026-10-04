import { defineConfig } from '@playwright/test';

// End-to-end suite covering both apps (single suite on purpose: the CRUD
// flow asserts public-site effects of admin actions). One worker: the
// contact endpoint is rate-limited per IP and every spec hits localhost,
// so serial runs stay deterministic. No CI wiring (no CI exists yet).
//
// Prerequisites before `npm run test:e2e` (same chain as every prior
// phase's live verification):
//   1. Local Postgres up, migrated + seeded (packages/db README).
//   2. Both apps built (`npm run build`) and serving. The defaults are the
//      project's one local port convention — web on :3000, admin on :3001 —
//      which is also what `npm run dev:web` / `dev:admin` bind with no
//      arguments, so a plain `npm run test:e2e` needs no URL overrides:
//        WEB_URL  (default http://localhost:3000)  -> apps/web
//        ADMIN_URL (default http://localhost:3001) -> apps/admin
//      apps/web must be served on the port its NEXT_PUBLIC_WEB_URL names:
//      `isSameOrigin` compares the request Origin against that value, so
//      serving the app on a different port makes every contact-form POST
//      fail with `bad_origin` and the contact spec cannot pass. That value is
//      inlined at build time, so changing it means rebuilding.
//   3. ADMIN_PASSWORD set (the seeded admin's password for this run).
//   4. Both servers freshly started. The public contact endpoint allows 5
//      POSTs per 10 minutes per IP and the admin login endpoint 10 per 15
//      minutes; both limiters are in-memory, so a restart is what resets
//      them. The admin specs share one sign-in per (locale, account) via
//      e2e/admin-session.ts, which keeps a full run to about five logins —
//      enough for two consecutive runs against the same server.
export default defineConfig({
  testDir: './e2e',
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  use: {
    trace: 'retain-on-failure',
  },
});
