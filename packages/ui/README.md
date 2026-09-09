# @colina/ui

Shared presentational components used by `apps/web` and `apps/admin`.
TailwindCSS classes only — no styling library, no runtime dependencies
(`react` is a peer dependency).

- `Button` — `<button>` or `<a>` (when `href` is set); variants
  `primary` / `secondary` / `ghost`, sizes `sm` / `md` / `lg`.
- `Card` — bordered surface with optional `title` / `description`.
- `Container` — centered `max-w-7xl` page wrapper.

The `brand` color tokens used here are defined in each app's
`tailwind.config.ts` (identical extension in both apps; both apps also
include `../../packages/ui/src` in their Tailwind `content` globs so the
classes are generated).
