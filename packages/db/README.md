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
npx prisma generate      # regenerate the client after schema changes
npx prisma validate      # validate the schema without a database
```

`DATABASE_URL` must also be set for `prisma format`/`generate` (Prisma 7
reads it from `prisma.config.ts` even for offline commands) — any value
works there; only `migrate`/`seed` need a live database.
