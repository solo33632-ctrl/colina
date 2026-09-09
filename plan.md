# PLAN.md — Colina Website + Admin Panel — Build Plan

## How to use this file
- This is the single source of truth for scope and progress.
- Before starting a phase: read `agent.md` fully, then read this whole file,
  then implement **only** the phase given in the current prompt.
- After a phase is reviewed and accepted by the human, its checkbox is
  marked `[x]` and the "Status" section below is updated. The agent never
  marks phases done itself.

## Reference
A competitor site (production-line manufacturer) was reviewed for structure
and tone only — no copying of code, text, images, or design. Its structure:
home (hero, product categories, why-us, world agents map, company timeline,
news, contact form, client logos), about us, product categories → machines,
worldwide agents, events, news, contact, privacy policy.

Colina's site follows a similar overall shape, plus a dedicated
**Maintenance / Services** section, since after-sales maintenance is a core
part of Colina's business (not just a footnote like on the reference site).

## Languages
Arabic (default, RTL) and English (LTR) at launch. Translation files are
structured so more languages can be added later without refactoring.

## Content types (data model, high level)
- `MachineCategory` — name, slug, description, image
- `Machine` — name, slug, category, short/full description, specs, image
  gallery, datasheet PDF, related machines
- `MaintenanceService` — title, description, icon, scope of service
- `MaintenanceRequest` — lead: name, company, phone, email, machine/model,
  message, status
- `Partner` — name, logo
- `Agent` / `Branch` (optional) — country, contact info, if Colina has
  international agents like the reference site
- `NewsPost` (optional, simple) — title, date, body, image
- `ContactMessage` — name, email, phone, message, status
- `AdminUser` — email, password hash, role
- `AuditLog` — admin user, action, entity, timestamp

## Phases

- [ ] **Phase 0 — Content & requirements gathering** (human-only, no code):
  Colina finalizes real text/images/specs for machines, categories,
  maintenance services, partners, and contact details. Can run in parallel
  with phases 1–3.
- [ ] **Phase 1 — Project scaffolding**: monorepo, `apps/web`, `apps/admin`,
  TypeScript, ESLint/Prettier, TailwindCSS, base folder structure,
  `.env.example`, README.
- [ ] **Phase 2 — Database schema**: Prisma schema for all content types
  above, initial migration, seed script with placeholder data.
- [ ] **Phase 3 — Design system & i18n**: Tailwind theme, shared layout
  components (Header, Footer, Container, Button, Card), `next-intl` setup
  for `ar`/`en`, RTL/LTR switching, language switcher.
- [ ] **Phase 4 — Public home page**: hero, product categories grid, why-us
  section, timeline (optional), client logos, contact section UI, footer.
- [ ] **Phase 5 — Public: machine categories & machine pages**: category
  listing, category detail (machines grid), machine detail page (gallery,
  specs, PDF datasheet, related machines).
- [ ] **Phase 6 — Public: Maintenance/Services section**: services overview
  page + maintenance request form (client-side validation).
- [ ] **Phase 7 — Public: About, Partners, Contact, Legal pages**:
  about-us, partners/clients page, contact page (map + form), privacy
  policy.
- [ ] **Phase 8 — Backend API & form handling**: server-side validation
  (Zod), Prisma writes for `ContactMessage`/`MaintenanceRequest`, rate
  limiting, email notification on new lead, wire up all public forms.
- [ ] **Phase 9 — Admin authentication**: Auth.js setup, login page,
  protected middleware, roles (super-admin/editor), logout, password reset.
- [ ] **Phase 10 — Admin CRUD: categories & machines**: list/create/edit/
  delete UI, image upload, form validation.
- [ ] **Phase 11 — Admin CRUD: partners, maintenance services, news,
  agents**: same CRUD pattern for the remaining content types.
- [ ] **Phase 12 — Admin: leads inbox & audit log**: view/manage
  `ContactMessage`/`MaintenanceRequest` submissions, status updates, audit
  log view.
- [ ] **Phase 13 — Security hardening pass**: review headers, rate limits,
  validation coverage, dependency audit (`npm audit`), admin route
  protection, backup/export strategy.
- [ ] **Phase 14 — SEO & performance**: meta tags, `sitemap.xml`,
  `robots.txt` (block `apps/admin` entirely), structured data, image
  optimization, Lighthouse pass.
- [ ] **Phase 15 — Testing pass**: unit tests for utils/validation, e2e for
  contact form + admin login + one CRUD flow, RTL/LTR visual check.
- [ ] **Phase 16 — Deployment**: hosting setup (see Hosting notes),
  environment variables, custom domains, go-live checklist.

## Status
- Current phase: **Phase 1 — not started**
- Last updated by: human, after reviewing agent output.

## Hosting notes (non-blocking, decide later)
Recommended for launch: Vercel (both apps) + Neon or Supabase (PostgreSQL,
free tier) + Cloudinary or Supabase Storage (images/PDFs). Fully
free-tier-capable to start, and the stack is container-friendly, so moving
to a paid VPS later is a straightforward migration, not a rewrite.
