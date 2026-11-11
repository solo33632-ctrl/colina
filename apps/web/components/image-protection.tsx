'use client';

import { useEffect } from 'react';
import { installImageProtection } from '@/lib/image-protection';

/**
 * Mounted once in the locale layout. Installs the shared copy deterrent for
 * `[data-protected-image]` elements and renders nothing — no wrapper, no
 * layout shift, no effect on SSR/ISR.
 */
export function ImageProtection() {
  useEffect(() => installImageProtection(document), []);
  return null;
}
