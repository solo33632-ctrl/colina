# @colina/db

Shared Prisma schema + generated client (PostgreSQL).

- `prisma/schema.prisma` — all content models (bilingual `*Ar`/`*En` columns).
- `prisma/seed.ts` — placeholder seed data for later phases.
- `prisma.config.ts` — datasource URL (`DATABASE_URL`) + migration/seed wiring.
- `index.ts` — typed `prisma` client singleton (import this in apps).

## Setup

```bash
# From the repo root, copy the placeholder and point it at your database:
cp .env.example .env
# edit DATABASE_URL, then from packages/db:
npx prisma migrate dev   # apply migrations (runs the seed afterwards)
npx prisma db seed       # re-run the seed any time (idempotent upserts)
npx prisma validate      # validate the schema without a database
```

The generated client (`prisma/generated/`, gitignored) regenerates
automatically via the root `postinstall` hook on every `npm install` —
including clean clones and Vercel builds. Run `npx prisma generate`
manually only after editing `schema.prisma` mid-session, when
`node_modules` isn't being reinstalled.

Prerequisite: `DATABASE_URL` must be set (even to the `.env.example`
placeholder) before `npm install`, because Prisma 7 resolves it from
`prisma.config.ts` even for offline generation — without it,
postinstall fails loudly instead of silently leaving a broken client.
On Vercel this means the variable must exist in the project environment,
not just at runtime.

`DATABASE_URL` must also be set for `prisma format`/`generate` (Prisma 7
reads it from `prisma.config.ts` even for offline commands) — any value
works there; only `migrate`/`seed` need a live database.

## Seed admin password (Phase 9)

`prisma/seed.ts` sets `admin@example.com` from `SEED_ADMIN_PASSWORD`
(documented in `.env.example`). The value is hashed with argon2id before
storage and the plaintext is never written anywhere — if the variable is
unset, the seed generates a random password, hashes it, and prints the
plaintext **once** to the console. Every seed run resets the password, so
re-seeding a shared database locks out the old one by design.
