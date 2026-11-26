import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  categoryFindMany: vi.fn(),
  machineFindMany: vi.fn(),
  maintenanceCategoryFindMany: vi.fn(),
  maintenanceShowcaseFindMany: vi.fn(),
}));

vi.mock('@colina/db', () => ({
  prisma: {
    machineCategory: { findMany: db.categoryFindMany },
    machine: { findMany: db.machineFindMany },
    maintenanceCategory: { findMany: db.maintenanceCategoryFindMany },
    maintenanceShowcase: { findMany: db.maintenanceShowcaseFindMany },
  },
}));

vi.mock('@/i18n/navigation', () => ({
  getPathname: ({ locale, href }: { locale: string; href: string }) =>
    `/${locale}${href === '/' ? '' : href}`,
}));

import sitemap, { revalidate } from '@/app/sitemap';
import { PUBLIC_CATEGORY_WHERE, PUBLIC_MACHINE_WHERE } from './public-content';

const UPDATED = new Date('2026-01-02T03:04:05.000Z');

type CategoryRow = {
  slug: string;
  updatedAt: Date;
  isPublished: boolean;
};

type MachineRow = {
  slug: string;
  updatedAt: Date;
  isPublished: boolean;
  category: { isPublished: boolean };
};

const categories: CategoryRow[] = [
  { slug: 'published-category', updatedAt: UPDATED, isPublished: true },
  { slug: 'draft-category', updatedAt: UPDATED, isPublished: false },
];

const machines: MachineRow[] = [
  {
    slug: 'published-machine',
    updatedAt: UPDATED,
    isPublished: true,
    category: { isPublished: true },
  },
  {
    slug: 'draft-machine',
    updatedAt: UPDATED,
    isPublished: false,
    category: { isPublished: true },
  },
  {
    slug: 'machine-in-draft-category',
    updatedAt: UPDATED,
    isPublished: true,
    category: { isPublished: false },
  },
];

beforeEach(() => {
  vi.stubEnv('NEXT_PUBLIC_WEB_URL', 'https://web.example.test');
  db.categoryFindMany.mockReset();
  db.machineFindMany.mockReset();
  db.maintenanceCategoryFindMany.mockReset();
  db.maintenanceShowcaseFindMany.mockReset();

  // Emulate the two Prisma predicates the route uses. A draft row is
  // therefore impossible to smuggle into the result, exactly as in the
  // database.
  db.categoryFindMany.mockImplementation(
    ({ where }: { where: { isPublished?: boolean } }) =>
      categories
        .filter((row) => !where.isPublished || row.isPublished)
        .map(({ slug, updatedAt }) => ({ slug, updatedAt }))
  );
  db.machineFindMany.mockImplementation(
    ({
      where,
    }: {
      where: { isPublished?: boolean; category?: { isPublished?: boolean } };
    }) =>
      machines
        .filter((row) => !where.isPublished || row.isPublished)
        .filter(
          (row) => !where.category?.isPublished || row.category.isPublished
        )
        .map(({ slug, updatedAt }) => ({ slug, updatedAt }))
  );
  db.maintenanceCategoryFindMany.mockResolvedValue([]);
  db.maintenanceShowcaseFindMany.mockResolvedValue([]);
});

describe('sitemap', () => {
  it('refreshes hourly', () => {
    expect(revalidate).toBe(3600);
  });

  it('lists static pages and published items in both locales', async () => {
    const entries = await sitemap();
    const urls = entries.map((entry) => entry.url);

    for (const path of [
      '/ar',
      '/en',
      '/ar/about',
      '/en/about',
      '/ar/categories',
      '/en/categories',
      '/ar/machines',
      '/en/machines',
      '/ar/privacy',
      '/en/privacy',
    ]) {
      expect(urls).toContain(`https://web.example.test${path}`);
    }

    for (const path of [
      '/ar/categories/published-category',
      '/en/categories/published-category',
      '/ar/machines/published-machine',
      '/en/machines/published-machine',
    ]) {
      expect(urls).toContain(`https://web.example.test${path}`);
    }
  });

  it('excludes draft machines and machines in draft categories', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.join('\n')).not.toContain('draft-machine');
    expect(urls.join('\n')).not.toContain('machine-in-draft-category');
    expect(urls.join('\n')).not.toContain('draft-category');
  });

  it('uses the shared public predicates for the database queries', async () => {
    await sitemap();

    expect(db.categoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_CATEGORY_WHERE })
    );
    expect(db.machineFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: PUBLIC_MACHINE_WHERE })
    );
  });

  it('adds both locale alternates and lastModified from updatedAt', async () => {
    const entries = await sitemap();
    const machine = entries.find(
      (entry) =>
        entry.url === 'https://web.example.test/en/machines/published-machine'
    );

    expect(machine?.lastModified).toEqual(UPDATED);
    expect(machine?.alternates?.languages).toEqual({
      ar: 'https://web.example.test/ar/machines/published-machine',
      en: 'https://web.example.test/en/machines/published-machine',
      'x-default': 'https://web.example.test/ar/machines/published-machine',
    });
  });

  it('never lists admin, API or confirmation URLs', async () => {
    const urls = (await sitemap()).map((entry) => entry.url);

    expect(urls.some((url) => url.includes('/admin'))).toBe(false);
    expect(urls.some((url) => url.includes('/api'))).toBe(false);
    expect(urls.some((url) => /thank|success|confirmation/i.test(url))).toBe(
      false
    );
  });
});
