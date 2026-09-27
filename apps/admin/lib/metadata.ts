import type { Metadata } from 'next';
import { hasLocale } from 'next-intl';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { routing } from '@/i18n/routing';
import type messages from '../messages/en.json';

type Namespace = keyof typeof messages;

// Dot-joined union of every leaf message key, matching what next-intl's
// translator accepts. Deriving it (rather than accepting `string`) keeps a
// typo in a page's section key a compile error.
type LeafKeys<T> = T extends string
  ? never
  : {
      [K in keyof T & string]: T[K] extends string
        ? K
        : `${K}.${LeafKeys<T[K]>}`;
    }[keyof T & string];

/**
 * Admin page title, as "<section> — Colina Admin", localized.
 *
 * The `robots: noindex` block is NOT set here: the `[locale]` layout already
 * applies it to every page beneath it, and setting it twice would only
 * duplicate the tag in the rendered head.
 *
 * Pages call this from their own `generateMetadata` because the locale lives
 * in the awaited route params:
 *
 *     export async function generateMetadata({ params }) {
 *       const { locale } = await params;
 *       return sectionMetadata(locale, 'Categories', 'heading');
 *     }
 */
export async function sectionMetadata<NS extends Namespace>(
  locale: string,
  namespace: NS,
  // Scoped to the namespace, so passing a key that lives in a different
  // section is a compile error too.
  sectionKey: LeafKeys<(typeof messages)[NS]>
): Promise<Metadata> {
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  const meta = await getTranslations({ locale, namespace: 'Metadata' });
  // `namespace` is still the unresolved generic here, so next-intl's
  // overloads cannot narrow it. The public signature above is what enforces
  // that the key belongs to the namespace; this cast only bridges the lookup.
  const t = (await getTranslations({ locale, namespace })) as unknown as (
    key: LeafKeys<(typeof messages)[NS]>
  ) => string;
  return { title: meta('sectionTemplate', { section: t(sectionKey) }) };
}
