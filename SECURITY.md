# SECURITY.md — Accepted Security Exceptions & Audit Log

Append-only log of dependency vulnerabilities that were reviewed and
**explicitly accepted** (with justification), so future phases don't lose
this context in chat history. Anything listed here must be re-audited in
**Phase 13 (Security hardening pass)**.

Rules for adding entries: package + version range, GHSA link(s), why the
fix wasn't applied, why exposure is considered acceptable, and the
re-audit trigger.

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

## Baseline

- End of Phase 1 correction: `npm audit` — 0 vulnerabilities.
- End of Phase 2: `npm audit` — 4 high (the two packages above;
  `mysql2` counts two advisories), everything else clean.
