# Colina

Corporate website + admin panel monorepo.

- `apps/web` — public marketing site (Next.js App Router, bilingual ar/en via next-intl).
- `apps/admin` — internal admin dashboard, separate app / subdomain in production, `noindex` on every route. English-only for now (see Notes).
- `packages/db` — shared Prisma schema + client, PostgreSQL.
- `packages/ui` — shared presentational components (Button, Card, Container).

See `plan.md` for the full phased build plan and `agent.md` for implementation rules.

## Workspace manager: npm workspaces

Phase 1 uses **npm workspaces** (`apps/*`, `packages/*`):

- Available out of the box with Node/npm — no extra tooling install (pnpm was not installed in this environment).
- Sufficient for 2 apps + 1 shared package at this stage.
- Works with Vercel (see hosting notes in `plan.md`) with zero extra config.
- Lower onboarding friction for future maintainers.

If install times / disk usage become an issue later, migrating to pnpm workspaces is straightforward (same layout, add `pnpm-workspace.yaml`).

## Prerequisites

- Node.js 24 (Active LTS, see `.nvmrc`; `next@16.3.4` requires Node `>=20.9.0`)
- npm 11+ (ships with Node 24)

If you use nvm: `nvm use` (installs/uses Node 24 automatically).

### System libraries for E2E browsers (Playwright)

The `test:e2e` suite drives a real Chromium. On minimal Linux bases
(Ubuntu container/CI images especially), Chromium needs OS libraries
that Node alone doesn't provide (`libnspr4`, `libnss3`, `libasound2`,
…). Without them the browser process exits immediately (code 127) and
every spec fails — with no hint that a system package is the cause.

Standard fix (needs root, e.g. in CI setup or a Dockerfile):

```bash
npx playwright install --with-deps chromium
```

That single command installs both the browser and its system
dependencies. Verifying it worked: `npx playwright install --dry-run`
or simply running `npm run test:e2e`.

## Install

```bash
npm install
```

## Run locally

Run each app in its own terminal (different ports so both run at once):

```bash
# Public site → http://localhost:3000/ar (Arabic, default) or /en (English)
npm run dev:web
# or: npm run dev --workspace=@colina/web

# Admin panel (English-only) → http://localhost:3001
npm run dev:admin
# or: npm run dev --workspace=@colina/admin
```

## Database (`packages/db`)

```bash
cp .env.example .env   # set DATABASE_URL (never commit .env)
cd packages/db
npx prisma migrate dev # apply migrations (runs the seed afterwards)
npx prisma db seed     # re-run seed any time (idempotent upserts)
```

See `packages/db/README.md` for details.

## Build / lint / format

```bash
# Build both apps
npm run build
# Or individually:
npm run build:web
npm run build:admin

# Lint both apps (ESLint 9 flat config, `eslint .` per app — `next lint` was removed in Next 16)
npm run lint

# Prettier
npm run format
npm run format:check
```

## Testing

```bash
npm test              # unit tests (vitest, all workspaces)
npm run test:e2e      # Playwright suite in ./e2e (needs both apps serving)
```

Unit tests live next to the code (`lib/*.test.ts`, pure logic only —
no DB, no network). The e2e suite needs a live environment first:

```bash
# 1. Postgres up, migrated + seeded (see Database above)
# 2. Both apps built and serving, e.g.:
#      web on :3120, admin on :3121 (ports are configurable via
#      WEB_URL / ADMIN_URL env vars, defaults shown)
# 3. ADMIN_EMAIL / ADMIN_PASSWORD set to a seeded admin login
WEB_URL=http://localhost:3120 ADMIN_URL=http://localhost:3121 \
  ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD='<seed password>' \
  npm run test:e2e
```

(Note: no CI config exists yet — wiring these scripts into CI belongs to
a future phase at the earliest.)

## Structure

```
colina/
  apps/
    web/                 # Public site (ar at /ar, en at /en)
      app/
        layout.tsx       # minimal root (locale shell lives in [locale]/)
        [locale]/
          layout.tsx     # <html lang dir>, fonts, header/footer, metadata
          page.tsx       # placeholder home (translated)
      components/        # site-header, site-footer, language-switcher
      i18n/              # routing, request, navigation, global (types)
      messages/          # ar.json, en.json
      proxy.ts           # next-intl locale middleware (Next 16 name)
      next.config.mjs    # + next-intl plugin
      tailwind.config.ts # brand scale + font tokens, scans packages/ui
      postcss.config.mjs
      tsconfig.json
      eslint.config.mjs  # flat config: next/core-web-vitals + next/typescript + prettier
    admin/               # Admin panel (English-only, port 3001, noindex)
      app/
        layout.tsx       # includes robots noindex + admin shell
        page.tsx
        globals.css
      components/        # header, footer (app-specific)
      next.config.mjs
      tailwind.config.ts # same brand extension as web (see note there)
      postcss.config.mjs
      tsconfig.json
      eslint.config.mjs
  packages/
    db/                  # Prisma schema + client + seed
      index.ts
    ui/                  # Button, Card, Container (Tailwind only)
      src/
  eslint.config.mjs      # Root flat config (ignores only; per-app configs are authoritative)
  .prettierrc.json       # Shared Prettier
  .env.example           # Placeholder env vars (no real values)
  SECURITY.md            # Accepted audit exceptions log (re-audit in Phase 13)
  agent.md
  plan.md
```

## Notes

- Admin is English-only for now (assumption — confirm whether Colina staff
  want a bilingual admin later; the `brand` theme + `font-arabic` token are
  already in place for it).
- i18n (web): `next-intl@4.14.2`, locales `ar` (default) + `en`, always-prefixed
  URLs (`/ar`, `/en`; `/` redirects to `/ar`). Static rendering via
  `setRequestLocale` (`next/root-params` doesn't compile under Turbopack 16.3.4
  from `i18n/request.ts` — revisit later).
- Typography: IBM Plex Sans Arabic + IBM Plex Sans via `next/font`
  (see summary for rationale). Palette: custom `brand` teal-green scale +
  built-in `stone` neutrals — starting point, not final branding.
- Stack: `next@16.3.4` + `react@19.2.8` / `react-dom@19.2.8`, `eslint@9.39.5`
  (flat config), `eslint-config-next@16.3.4`, `typescript@5.9.3`, Tailwind 3.4.18.
  `npm audit`: only the 4 accepted highs logged in SECURITY.md.
- Env vars in `.env.example` are placeholders only.
