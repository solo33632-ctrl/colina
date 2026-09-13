# SECURITY.md — Accepted Security Exceptions & Audit Log

Append-only log of dependency vulnerabilities that were reviewed and
**explicitly accepted** (with justification), so future phases don't lose
this context in chat history. Anything listed here must be re-audited in
**Phase 13 (Security hardening pass)**.

Rules for adding entries: package + version range, GHSA link(s), why the
fix wasn't applied, why exposure is considered acceptable, and the
re-audit trigger.

## Phase 13 re-audit outcome (2026-09-12)

- `prisma@latest` is still a release candidate (`8.0.0-rc.14`);
  `@prisma/client@latest` is `7.10.0` (already used). No stable release
  fixes the `deepmerge-ts`/`mysql2` transitive ranges — both exceptions
  below stand unchanged.
- `next-auth` is still `4.24.15` with the same `nodemailer@^7.0.7`
  optional peer — the v10 override stays.
- Fresh `npm audit`: exactly the 4 accepted highs, nothing new across
  12 phases of dependency additions.

## Accepted exceptions

### 1. `deepmerge-ts <8.0.0` via Prisma CLI (accepted in Phase 2)

- Advisory: [GHSA-ggr8-5vv4-36mx](https://github.com/advisories/GHSA-ggr8-5vv4-36mx)
  (stack exhaustion when merging recursive object graphs — High).
- Path: `prisma@7.10.0` → `@prisma/config` → `deepmerge-ts`.
- Why accepted: dev-time CLI tooling only (`prisma` is a `devDependency`;
  never bundled into Next.js production output). Exploitation requires
  attacker-controlled recursive input to a local config merge — no remote
  vector in this project. The audit-suggested fix (downgrade Prisma 7 →
  6.19.3, a full major downgrade off the current stable line) was judged a
  bigger risk than the advisory itself.
- Re-audit: Phase 13; upgrade when Prisma ships a fixed transitive range.

### 2. `mysql2 <=3.23.0` via Prisma CLI (accepted in Phase 2)

- Advisories:
  [GHSA-3f6p-5ww8-9rcr](https://github.com/advisories/GHSA-3f6p-5ww8-9rcr)
  (auth-plugin downgrade leaks plaintext credentials — High),
  [GHSA-rgwj-5xj2-c3m3](https://github.com/advisories/GHSA-rgwj-5xj2-c3m3)
  (unbounded zlib inflate / decompression-bomb DoS — High).
- Path: `prisma@7.10.0` → `mysql2` (driver Prisma CLI bundles for MySQL
  introspection support).
- Why accepted: same constraints as (1), plus this project is
  PostgreSQL-only — no MySQL connection is ever constructed, so the
  `mysql2` code paths (auth handshake, compressed-protocol handler) are
  never exercised. Same rejected fix (Prisma major downgrade).
- Re-audit: Phase 13; upgrade when Prisma ships a fixed transitive range.

## Approved install scripts (`allowScripts`, root `package.json`)

Install scripts that were read before approval (all fetch/select a
platform-specific binary — the standard napi-rs/esbuild pattern):

- `prisma@7.10.0`, `@prisma/engines@7.10.0` — download Prisma engines.
- `esbuild@0.27.7`, `esbuild@0.27.2` — select platform binary
  (`install.js` reviewed; 0.27.2 arrived via `npm audit fix`).
- `unrs-resolver@1.12.2` — 3-line postinstall calling
  `napi-postinstall`'s `checkAndPreparePackage` (transitive via
  `eslint-config-next` → `eslint-import-resolver-typescript`).
- `@swc/core@1.16.2` — standard SWC platform-binary selector
  (transitive via `next-intl`; same toolchain family as Next.js itself).
- `@parcel/watcher@2.6.0` — filename looks alarming
  (`build-from-source.js`) but it only runs `node-gyp rebuild` when
  `npm_config_build_from_source=true`, otherwise a no-op; prebuilt
  binary is used (transitive via `next-intl`).
- `argon2@0.45.1` — `cross-env ZERO_AR_DATE=1 node-gyp-build`, the
  standard prebuilt-native-binary loader (prebuilds ship for linux-x64,
  verified loading + hash/verify round-trip on Node 24). Direct dep of
  `@colina/admin` for password hashing.

## Baseline

- End of Phase 1 correction: `npm audit` — 0 vulnerabilities.
- End of Phase 2: `npm audit` — 4 high (the two packages above;
  `mysql2` counts two advisories), everything else clean.

## Dependency notes

- `nodemailer` vs `next-auth` peer (resolved in Phase 9): `next-auth@4.24.15`
  declares an _optional_ peer `nodemailer@^7.0.7` (for its Email provider,
  which this project doesn't use), while `npx audit` flags 10 high
  advisories across `nodemailer<=9.1.0` (SMTP/CRLF injection, TLS, SSRF —
  GHSA-c7w3, GHSA-vvjj, GHSA-268h, GHSA-wqvq, GHSA-r7g4, GHSA-p6gq,
  GHSA-8m3c, GHSA-wmmp, GHSA-2x7j, GHSA-cc9r). Pinning admin to v7 would
  have carried all ten, so both apps use `nodemailer@10.0.9` (single
  deduped copy) with an explicit root `overrides` entry
  (`next-auth@4.24.15 → nodemailer@10.0.9`, visible as "overridden" in
  `npm ls`). Runtime-safe: the peer belongs to an unused provider and
  v10's `sendMail` API is compatible. Revisit if next-auth v4 updates its
  peer range (Phase 13).

## Known interim weaknesses (not dependency exceptions — fix scheduled)

- **In-memory rate limiter** (`apps/web/lib/rate-limit.ts`): resets on
  restart, single-instance only. Move to a shared store (Redis/Upstash)
  in Phase 16. Fix scheduled: Phase 16 (hosting decision).
- **`X-Forwarded-For` trust** (`getClientIp` in the same module): only
  meaningful behind a reverse proxy that overwrites it (e.g. Vercel). On
  unprotected hosting the header is attacker-controlled and the limiter is
  fully bypassable by rotating it. Fix scheduled: Phase 16 — trust only
  the platform's guaranteed client-IP header.
- **Origin check without `NEXT_PUBLIC_WEB_URL`**: fail-closed in
  production (refuse), fail-open with a warning only in non-production
  (`apps/web/lib/request-origin.ts`). No fix needed — just ensure the var
  is always set in production (Phase 16 checklist).

## Backup / export strategy (planned — needs real hosting, Phase 16)

No real database exists yet (only throwaway local clusters), so this is
a checklist for Phase 16, not an implementation:

- Automated daily `pg_dump` (custom format) of the production Postgres
  (Neon/Supabase per plan.md), retained 30 days, stored encrypted in an
  account separate from the database host.
- Point-in-time recovery enabled on the provider as the primary path;
  dumps are the portable fallback (provider exit, region loss).
- Quarterly restore drill to a scratch database (an untested backup is
  not a backup) + `prisma migrate` replay check from zero.
- Media (Phase 16 storage backend) needs its own versioned-bucket /
  lifecycle policy — DB dumps don't cover uploaded files.
- Document who can trigger a restore and the expected RTO/RPO before
  go-live.
