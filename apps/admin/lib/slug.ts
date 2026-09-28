// Slug rules, in one place: the create/edit forms derive a slug from the
// English name as it is typed (see `useAutoSlug`), and the Zod schemas
// validate the result with the same shape — lowercase letters, digits and
// single dashes.
//
// ASCII only, on purpose. A slug is a public URL segment, and a URL should
// not carry percent-encoded Arabic; a name typed in Arabic therefore derives
// an empty slug and the editor types one by hand, which is what the "touched"
// flag in the form is for.
export function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
