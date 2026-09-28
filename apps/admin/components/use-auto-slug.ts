'use client';

import { useEffect, useState } from 'react';
import type { Path, PathValue, UseFormSetValue } from 'react-hook-form';
import { FieldValues } from 'react-hook-form';
import { slugify } from '@/lib/slug';

// Keeps the slug field in step with the English name while the editor has not
// taken it over. Once they type in the slug themselves it is theirs: call
// `markSlugTouched` from the field's onChange and the derivation stops for
// good, so a save never silently rewrites a URL someone chose by hand.
//
// `enabled` is create mode only. On an edit the field is pre-filled with the
// live slug, and regenerating it from a renamed item would break the public
// URL and every inbound link to it.
export function useAutoSlug<T extends FieldValues>({
  enabled,
  source,
  slug,
  setValue,
}: {
  enabled: boolean;
  /** Current value of the English name field. */
  source: string;
  slug: Path<T>;
  setValue: UseFormSetValue<T>;
}) {
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!enabled || touched) {
      return;
    }
    const next = slugify(source);
    if (next) {
      // `slug` is a string-valued path on every form that uses this hook, but
      // the field's value type is unknown while T is still generic.
      setValue(slug, next as PathValue<T, Path<T>>, {
        shouldValidate: true,
        shouldDirty: true,
      });
    }
  }, [enabled, touched, source, slug, setValue]);

  return { markSlugTouched: () => setTouched(true) };
}
