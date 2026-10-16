import type { MetadataRoute } from 'next';
import { prisma } from '@colina/db';
import { getPathname } from '@/i18n/navigation';
import { routing } from '@/i18n/routing';
import { getBaseUrl } from '@/lib/seo';

type Locale = (typeof routing.locales)[number];

const STATIC_PATHS = [
  '/',
  '/about',
  '/categories',
  // The catalogue listing. Its filtered views are the same URL with a
  // `?category=` query, which a sitemap must not list, so only the unfiltered
  // entry belongs here — the chips on the page reach every other view.
  '/machines',
  '/services',
  '/partners',
  '/contact',
  '/privacy',
] as const;

async function alternatesFor(href: string): Promise<Record<string, string>> {
  const languages: Record<string, string> = {};
  for (const locale of routing.locales) {
    languages[locale] = getBaseUrl() + (await getPathname({ locale, href }));
  }
  languages['x-default'] =
    getBaseUrl() + (await getPathname({ locale: routing.defaultLocale, href }));
  return languages;
}

// Sitemap covering every static route plus every category/machine detail
// page, in both locales, with per-URL hreflang alternates (next-intl's
// documented sitemap pattern). DB-driven: runs at build time.
// lastModified: content timestamps where they exist, build time for
// static copy. changeFrequency: weekly for entry points that aggregate
// changing content, monthly for the rest.
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const [categories, machines] = await Promise.all([
    prisma.machineCategory.findMany({
      select: { slug: true, updatedAt: true },
    }),
    prisma.machine.findMany({ select: { slug: true, updatedAt: true } }),
  ]);

  const entries: MetadataRoute.Sitemap = [];

  for (const locale of routing.locales as readonly Locale[]) {
    for (const path of STATIC_PATHS) {
      entries.push({
        url: getBaseUrl() + (await getPathname({ locale, href: path })),
        lastModified: now,
        changeFrequency: path === '/' ? 'weekly' : 'monthly',
        alternates: { languages: await alternatesFor(path) },
      });
    }
    for (const category of categories) {
      const href = `/categories/${category.slug}`;
      entries.push({
        url: getBaseUrl() + (await getPathname({ locale, href })),
        lastModified: category.updatedAt,
        changeFrequency: 'weekly',
        alternates: { languages: await alternatesFor(href) },
      });
    }
    for (const machine of machines) {
      const href = `/machines/${machine.slug}`;
      entries.push({
        url: getBaseUrl() + (await getPathname({ locale, href })),
        lastModified: machine.updatedAt,
        changeFrequency: 'monthly',
        alternates: { languages: await alternatesFor(href) },
      });
    }
  }

  return entries;
}
