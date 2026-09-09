# Colina

Corporate website + admin panel monorepo.

- `apps/web` — public marketing site (Next.js App Router).
- `apps/admin` — internal admin dashboard, separate app / subdomain in production, `noindex` on every route.
- `packages/db` — shared Prisma schema + client (placeholder in Phase 1, implemented in Phase 2).

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

## Install

```bash
npm install
```

## Run locally

Run each app in its own terminal (different ports so both run at once):

```bash
# Public site → http://localhost:3000
npm run dev:web
# or: npm run dev --workspace=@colina/web

# Admin panel → http://localhost:3001
npm run dev:admin
# or: npm run dev --workspace=@colina/admin
```

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

## Structure

```
colina/
  apps/
    web/                 # Public site — placeholder home: "Colina — coming soon"
      app/
        layout.tsx
        page.tsx
        globals.css      # Tailwind directives
      next.config.mjs
      tailwind.config.ts
      postcss.config.mjs
      tsconfig.json
      eslint.config.mjs  # flat config: next/core-web-vitals + next/typescript + prettier
    admin/               # Admin panel — placeholder home: "Colina Admin" (port 3001, noindex)
      app/
        layout.tsx       # includes robots noindex
        page.tsx
        globals.css
      next.config.mjs
      tailwind.config.ts
      postcss.config.mjs
      tsconfig.json
      eslint.config.mjs
  packages/
    db/                  # Placeholder — Prisma schema + client lands in Phase 2
      index.ts
  eslint.config.mjs      # Root flat config (ignores only; per-app configs are authoritative)
  .prettierrc.json       # Shared Prettier
  .env.example           # Placeholder env vars (no real values)
  agent.md
  plan.md
```

## Notes

- Phase 1 only: scaffolding, placeholder pages, Tailwind configured, ESLint + Prettier shared. No i18n, database, auth, or content yet (Phases 2–3).
- Stack (Phase 1 correction): `next@16.3.4` + `react@19.2.8` / `react-dom@19.2.8`, `eslint@9.39.5` (flat config), `eslint-config-next@16.3.4`, `typescript@5.9.3`, Tailwind 3.4.18. `npm audit` reports 0 vulnerabilities.
- Env vars in `.env.example` are placeholders only.
