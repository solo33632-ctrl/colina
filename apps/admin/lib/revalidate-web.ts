import { revalidatePath } from 'next/cache';

// Revalidate public apps/web paths after admin content mutations.
//
// ARCHITECTURAL CAVEAT (read before "fixing"): apps/web and apps/admin
// are separate Next.js deployments with separate ISR caches.
// revalidatePath() here purges THIS app's cache; it does NOT reach
// apps/web's cache. These calls are still made on every mutation because
// they are correct for any co-located deployment and document exactly
// which public pages each mutation affects — but until Phase 16 adds a
// cross-app purge (admin → authenticated web /api/revalidate webhook),
// already-cached web pages refresh on their `revalidate` window (3600s).
// Brand-new slugs are unaffected: uncached dynamic routes render on
// demand without any rebuild.
const LOCALES = ['ar', 'en'] as const;

// Expands app-router paths to both locales: '/' → '/ar' + '/en',
// '/categories/x' → '/ar/categories/x' + '/en/categories/x'.
export function revalidateWebPaths(paths: string[]) {
  for (const path of paths) {
    for (const locale of LOCALES) {
      revalidatePath(`/${locale}${path === '/' ? '' : path}`, 'page');
    }
  }
}
