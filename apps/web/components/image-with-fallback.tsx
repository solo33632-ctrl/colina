'use client';

import { useState } from 'react';
import type { RefObject } from 'react';

type ImageWithFallbackProps = {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  /**
   * How the artwork fills its box.
   *
   * `cover` (the default) is a 16:9 box that crops to fill — right for a
   * machine or category photo, where the frame is chosen for the subject and
   * trimming the edges is the point.
   *
   * `contain` never crops: the whole artwork is fitted inside the box and
   * letterboxed with whatever space is left over. It is what a *logo* needs,
   * because a logo's aspect ratio is its content — cropping one silently
   * amputates the first and last letters of the wordmark. In this mode the
   * component sets no aspect ratio and the caller owns the box's size, which
   * is what keeps a row of logos the same height whatever shape each one is.
   */
  fit?: 'cover' | 'contain';
  /**
   * Fires once the image is decoded, handing over the element so callers can
   * read `naturalWidth`/`naturalHeight` (the gallery's magnifier needs them).
   */
  onLoad?: (image: HTMLImageElement) => void;
  /**
   * Above-the-fold images (the gallery hero) must not be lazy: a lazy hero
   * is not discovered until it is near the viewport, which delays LCP.
   */
  loading?: 'lazy' | 'eager';
  /**
   * Ref for the underlying `<img>`. Callers that need the natural size need
   * this too: an image served from the browser cache finishes loading
   * *before* React hydrates, so its `load` event is never observed and
   * `onLoad` alone would leave them stuck waiting.
   */
  imgRef?: RefObject<HTMLImageElement | null>;
};

// Renders `src` when it loads, otherwise a styled initial-letter tile.
// Seed rows carry placeholder paths that 404 until real media arrives
// (Phase 0/10) — this keeps review builds presentable instead of showing
// broken-image icons.
export function ImageWithFallback({
  src,
  alt,
  className,
  fallbackClassName,
  fit = 'cover',
  onLoad,
  loading = 'lazy',
  imgRef,
}: ImageWithFallbackProps) {
  // Tracks *which* src failed rather than a bare flag, so pointing the
  // component at a different image (the gallery swaps its hero when a
  // thumbnail is clicked) re-attempts the load instead of leaving a stale
  // fallback tile on screen.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  // The two modes differ only in the box and the fit, so the initial-letter
  // fallback has to fill the same box as the artwork it stands in for.
  const boxClasses =
    fit === 'contain' ? 'h-full w-full' : 'aspect-video w-full';
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

  if (failed) {
    const initial = alt.trim().charAt(0).toLocaleUpperCase() || '?';
    return (
      <div
        role="img"
        aria-label={alt}
        className={`flex ${boxClasses} items-center justify-center overflow-hidden bg-brand-100 ${fallbackClassName ?? ''} ${className ?? ''}`}
      >
        <span aria-hidden="true" className="text-4xl font-bold text-brand-800">
          {initial}
        </span>
      </div>
    );
  }

  // Plain <img> on purpose: real media + next/image optimization arrive
  // with Phase 0/14. next/image would need remotePatterns for future
  // storage URLs and gives nothing for local 404 placeholders.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      ref={imgRef}
      src={src}
      alt={alt}
      loading={loading}
      onLoad={(event) => onLoad?.(event.currentTarget)}
      onError={() => setFailedSrc(src)}
      className={`${boxClasses} ${fitClass} ${className ?? ''}`}
    />
  );
}
