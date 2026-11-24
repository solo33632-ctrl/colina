import type { Prisma } from '@colina/db';

// Stage 4e: one definition of "the public may see this".
//
// A machine is public only when its own draft flag is true AND the category it
// belongs to is public too: an editor's new machine can be published by an
// admin while its category is still awaiting review, and it must stay hidden.
// Every public query (lists, detail pages, related machines, sitemap, metadata
// and static params) reads these constants so none of them can drift.
export const PUBLIC_CATEGORY_WHERE = {
  isPublished: true,
} satisfies Prisma.MachineCategoryWhereInput;

export const PUBLIC_MACHINE_WHERE = {
  isPublished: true,
  category: { isPublished: true },
} satisfies Prisma.MachineWhereInput;
