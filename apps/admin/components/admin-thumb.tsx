'use client';

import { useEffect, useState } from 'react';

// Thumbnail for the admin list tables, with a letter-tile fallback: a record
// whose image is missing — or whose URL 404s, which is what happens to the
// seed's local placeholder paths, since those files are served by the public
// app and not this one — shows the first character of its name instead of a
// broken-image icon.
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
//
// `fit` follows the same rule the public site uses (see
// `apps/web/components/image-with-fallback.tsx`), because a thumbnail is the
// same artwork at a different size. `cover` — the default, and right for the
// machine, category and news photographs that want a square frame — crops to
// fill. `contain` is what a *logo* needs: `cover` scales a wide wordmark up
// until it fills the box and throws away whatever pasts the edges, so "Edita"
// showed only "di" and "Mondelez International" showed "nde...rnal" — the
// first and last letters amputated, leaving an operator no way to tell two
// partners apart. `contain` fits the whole mark inside the tile instead, on a
// plate wider than it is tall because a wordmark is, with padding around it so
// a small mark is not flush against the edge. That is the same fix the public
// partners section got; this list never got it.
export function AdminThumb({
  src,
  name,
  fit = 'cover',
}: {
  src: string | null;
  name: string;
  fit?: 'cover' | 'contain';
}) {
  const [loaded, setLoaded] = useState(false);
  const contain = fit === 'contain';

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

  // The plate, not the artwork, and it is assembled per mode rather than
  // patched together with a trailing override: two competing `bg-*`
  // declarations in one class list are resolved by stylesheet order, not by
  // the order they are written here, so appending one to "fix" the other
  // works only by accident. Both plates keep the same height, so a column of
  // thumbnails stays aligned whichever artwork a row happens to hold.
  const plateBase =
    'flex h-10 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-stone-200';
  const plateSize = contain ? 'w-20 p-1.5' : 'w-10';

  if (!src || !loaded) {
    const initial = name.trim().charAt(0) || '?';
    return (
      <div
        role="img"
        aria-label={name}
        // A logo plate is empty when the artwork is missing, so it keeps the
        // white plate; only the compact square becomes the brand letter tile.
        className={`${plateBase} ${plateSize} ${contain ? 'bg-white' : 'bg-brand-100'}`}
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
      className={`${plateBase} ${plateSize} bg-white ${contain ? 'object-contain' : 'object-cover'}`}
    />
  );
}
