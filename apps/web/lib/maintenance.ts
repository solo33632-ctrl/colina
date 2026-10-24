import { prisma } from '@colina/db';

/**
 * One production line as the public maintenance pages need it.
 *
 * `coverImage` is the category's own photo when it has one, otherwise the
 * after photo of its newest item — the same "after" picture the line page
 * leads with, so a line without artwork still gets a real image on the tile.
 * `itemCount` is the number of machines in the line, which the card prints as
 * a pill.
 */
export type MaintenanceLineSummary = {
  id: string;
  slug: string;
  nameEn: string;
  nameAr: string;
  coverImage: string | null;
  itemCount: number;
};

/**
 * Every production line that has at least one machine, in display order.
 *
 * The `items: { some: {} }` filter is the public orphan guard applied at the
 * source: a line with nothing in it is not a destination yet, and the home
 * page must not offer a card that leads to an empty page. It also means the
 * count below can never be zero.
 *
 * Ordering is the admin's `sortOrder` first and creation time second, so a
 * line an editor deliberately places above another stays there.
 */
export async function getMaintenanceLines(): Promise<MaintenanceLineSummary[]> {
  const rows = await prisma.maintenanceCategory.findMany({
    where: { items: { some: {} } },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      imageUrl: true,
      _count: { select: { items: true } },
      // Only the newest item's after photo: that is the fallback cover, and
      // nothing else about the row is rendered on a category tile.
      items: {
        orderBy: [{ createdAt: 'desc' }, { nameEn: 'asc' }],
        take: 1,
        select: { afterImageUrl: true },
      },
    },
  });

  return rows.map(({ _count, items, imageUrl, ...line }) => ({
    ...line,
    coverImage: imageUrl ?? items[0]?.afterImageUrl ?? null,
    itemCount: _count.items,
  }));
}

/**
 * One production line with every machine in it, newest first.
 *
 * Returns `null` for an unknown slug, which the page turns into `notFound()`.
 * A line with no machines is a real row and comes back with an empty `items`
 * array: the page renders a neutral empty message rather than a 404, because
 * the line itself exists.
 */
export async function getMaintenanceLine(slug: string) {
  return prisma.maintenanceCategory.findUnique({
    where: { slug },
    select: {
      id: true,
      slug: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      imageUrl: true,
      items: {
        orderBy: [{ createdAt: 'desc' }, { nameEn: 'asc' }],
        select: {
          id: true,
          nameEn: true,
          nameAr: true,
          descriptionEn: true,
          descriptionAr: true,
          beforeImageUrl: true,
          afterImageUrl: true,
        },
      },
    },
  });
}

/**
 * One machine, but only when it belongs to the line named in the URL.
 *
 * The `category: { is: { slug } }` clause is the wrong-category guard: an id
 * that exists under another line returns `null` exactly like an id that does
 * not exist, so a detail page can never be reached through the wrong line.
 * Rows with `categoryId = null` are excluded too, because they have no
 * category to match — the orphan guard.
 */
export async function getMaintenanceItem(slug: string, id: string) {
  return prisma.maintenanceShowcase.findFirst({
    where: { id, category: { is: { slug } } },
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      descriptionEn: true,
      descriptionAr: true,
      beforeImageUrl: true,
      afterImageUrl: true,
      category: {
        select: {
          id: true,
          slug: true,
          nameEn: true,
          nameAr: true,
          descriptionEn: true,
          descriptionAr: true,
        },
      },
    },
  });
}

/**
 * Up to `take` other machines in the same line, newest first.
 *
 * The current machine is excluded explicitly: a curated list cannot produce
 * this case, but the line's own list can, and a "more machines" strip that
 * links back to the page you are on is noise.
 */
export async function getRelatedMaintenanceItems(
  categoryId: string,
  excludeId: string,
  take = 3
) {
  return prisma.maintenanceShowcase.findMany({
    where: { categoryId, id: { not: excludeId } },
    orderBy: [{ createdAt: 'desc' }, { nameEn: 'asc' }],
    take,
    select: {
      id: true,
      nameEn: true,
      nameAr: true,
      beforeImageUrl: true,
      afterImageUrl: true,
    },
  });
}
