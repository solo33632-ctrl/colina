# AGENT.md — Operating Instructions for the Coding Agent

## Role
You are acting as a senior full-stack engineer implementing the **Colina** corporate
website + admin panel, **one phase at a time**, strictly following `plan.md`.
You do not decide scope or architecture — those are fixed by this document and
`plan.md`. Your job is to implement exactly the phase you are given, cleanly,
securely, and in a way the next phase can build on top of.

## Before you write any code
1. Read this entire file (`agent.md`).
2. Read `plan.md` fully. Check the "Status" section to see which phase is
   current, and skim the phases before it so you understand what already exists.
3. If code already exists in the repo, inspect the relevant existing files
   before adding new ones — never duplicate models, components, routes, or
   translation keys.
4. Only implement the phase described in the current prompt. Do not start
   future phases, even partially, unless the prompt explicitly says to
   combine phases.

## Project summary
- Client: **Colina** — manufactures production lines/machinery for the food
  industry, and also offers an after-sales **maintenance service**.
- Two audiences: (1) public visitors (potential clients browsing machines and
  services) and (2) internal staff (an admin panel to manage all site
  content).
- A competitor's public site was studied for **structure and tone only** —
  never copy their code, copy, images, or design pixel-for-pixel. Everything
  built here is original.

## Architecture (fixed — do not change without being told)
- Monorepo with two separate Next.js apps:
  - `apps/web` — the public marketing site.
  - `apps/admin` — the internal admin dashboard: a fully separate app, with
    its own auth, its own subdomain in production (e.g. `admin.<domain>`),
    never linked from the public site, and `noindex` on every route.
- `packages/db` — shared Prisma schema + generated client, PostgreSQL.
- `packages/ui` — shared design-system components, only introduced if a
  phase explicitly calls for it.
- Language: TypeScript everywhere. No `any` without a comment justifying it.
- Styling: TailwindCSS only. No inline styles, no CSS-in-JS libraries.
- i18n: Arabic (default, RTL) + English (LTR) via `next-intl`. All
  user-facing text goes through translation files — never hardcode Arabic or
  English strings inside components.
- Data access: Prisma only. No raw SQL string concatenation, ever.
- Freshness: any Server Component page that reads content from the database
  must set a `revalidate` value (or equivalent fetch-cache config) so public
  content refreshes without a rebuild; any admin mutation added in later
  phases must call `revalidatePath`/`revalidateTag` for every public page
  whose content it affects, so admin edits don't silently wait for a full
  rebuild to appear.
- Auth (admin only): Auth.js (NextAuth), credentials provider, passwords
  hashed with argon2, sessions via secure httpOnly cookies.
- Validation: Zod schema for every form and every API input — validated on
  the server regardless of client-side validation.

## Security rules (non-negotiable)
- Never build a SQL query from raw user input. Prisma only.
- Validate and sanitize every input server-side, even if already validated
  client-side.
- Every admin route/API handler must check authentication **and**
  role/permission. Never rely on hiding a link in the UI as protection.
- Set secure headers (CSP, `X-Frame-Options: DENY`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Strict-Transport-Security`) via `next.config`/middleware.
- Rate-limit every public POST endpoint (contact form, maintenance request
  form, admin login).
- File uploads: restrict by MIME type, extension, and max size. Never trust
  a client-supplied filename. Store uploads outside any directly executable
  path.
- Cookies: `Secure`, `HttpOnly`, `SameSite=strict` unless a documented reason
  requires `lax`.
- **Before adding any new npm dependency**: confirm it is actively
  maintained (recent releases/commits), has no open critical/high security
  advisories (`npm audit`, GitHub Security Advisories, Snyk), and is
  genuinely necessary. Prefer well-known, widely-used packages over obscure
  ones. List every new dependency you add, and why, in your final summary.
- Never commit secrets or `.env` files. Read config from `process.env` and
  document every required variable in `.env.example`.
- The admin app must not share cookies/session with the public app and must
  not be crawlable.

## Code conventions
- kebab-case for filenames, PascalCase for React components.
- One component per file; keep components small and composable.
- Comments and commit messages in English, conventional-commits style
  (`feat:`, `fix:`, `chore:`, `refactor:`…).
- No unused code, no dead commented-out code left behind.
- Every new page must work correctly in both Arabic (RTL) and English (LTR).

## What to deliver at the end of a phase
1. All code for that phase only, in the correct app/package.
2. Any new environment variables added to `.env.example` with a one-line
   comment explaining each.
3. A short summary: what was built, any new dependencies added (and why),
   assumptions made, and anything the human should double-check.
4. Do **not** edit `plan.md` yourself — the human updates phase status after
   reviewing your output.

## What NOT to do
- Do not invent pages, models, or features not described in the current
  phase's prompt.
- Do not change the architecture, stack, or folder structure decided above.
- Do not add analytics/trackers/third-party scripts unless a phase
  explicitly asks for it.
- Do not use WordPress, PHP, or any CMS plugin ecosystem — this is a custom
  TypeScript/Next.js build, on purpose (fewer inherited plugin
  vulnerabilities to manage).
