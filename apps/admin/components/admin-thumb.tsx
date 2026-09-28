'use client';

import { useEffect, useState } from 'react';

// Small square thumbnail for the admin list tables, with a letter-tile
// fallback: a record whose image is missing — or whose URL 404s, which is
// what happens to the seed's local placeholder paths, since those files are
// served by the public app and not this one — shows the first character of
// its name instead of a broken-image icon.
//
// Admin-local copy of the approach in `apps/web/components/image-with-fallback.tsx`
// rather than an import: the two apps deploy separately and must never share
// code. Plain `<img>` on purpose (no next/image): uploads are already
// absolute Cloudinary URLs and next/image would need remotePatterns for them
// while giving nothing for a 40px internal thumbnail.
//
// The image is probed with a detached `Image` after mount rather than relying
// on the `<img>`'s own `onError`: a 40px thumbnail resolves in milliseconds,
// usually before React hydrates, and an error that fires before the handler is
// attached is missed — leaving the broken-image icon on screen. Rendering the
// tile first and swapping in only a load that has been confirmed keeps the row
// readable in every case.
export function AdminThumb({
  src,
  name,
}: {
  src: string | null;
  name: string;
}) {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!src) {
      return;
    }
    const probe = new Image();
    probe.onload = () => setLoaded(true);
    probe.onerror = () => setLoaded(false);
    probe.src = src;
    return () => {
      probe.onload = null;
      probe.onerror = null;
    };
  }, [src]);

  if (!src || !loaded) {
    const initial = name.trim().charAt(0) || '?';
    return (
      <div
        role="img"
        aria-label={name}
        className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-100"
      >
        <span aria-hidden="true" className="text-lg font-bold text-brand-800">
          {initial}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      loading="lazy"
      // The probe already confirmed the load; this only covers a URL that
      // breaks between the probe and the render.
      onError={() => setLoaded(false)}
      className="h-10 w-10 shrink-0 rounded-lg border border-stone-200 bg-white object-cover"
    />
  );
}
