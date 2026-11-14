'use client';

import { useState } from 'react';
import type { RefObject } from 'react';
import { preconnect } from 'react-dom';
import {
  buildCloudinarySrcset,
  CLOUDINARY_DEFAULT_WIDTH,
  isCloudinaryDeliveryUrl,
  transformCloudinaryImageUrl,
} from '@/lib/cloudinary-delivery';

type ImageWithFallbackProps = {
  src: string | null;
  alt: string;
  className?: string;
  fallbackClassName?: string;
  /**
   * DOM id for the `<img>` (or the fallback tile). Used where a caller needs
   * to reach one specific copy of an image — the category hero renders the
   * same photo twice and its tests/e2e select the layers by id.
   */
  id?: string;
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
  /**
   * `sizes` hint for the responsive Cloudinary `srcset` this component builds.
   * Forwarded to the `<img>` verbatim and omitted entirely when not supplied.
   * Non-Cloudinary sources get no srcset, so the hint is inert for them.
   */
  sizes?: string;
  /**
   * Fetch priority hint. `high` marks an above-the-fold image as the LCP
   * candidate so the browser fetches it ahead of everything else on the page.
   * Omitted when not supplied.
   */
  fetchPriority?: 'high' | 'low' | 'auto';
  /**
   * Decode hint for the real `<img>`.
   *
   * `async` is the default for the whole site: decoding a photo off the main
   * thread keeps a large image from blocking text paint. Callers can override
   * it for an image whose pixels must be ready synchronously, but no public
   * page needs that today.
   */
  decoding?: 'async' | 'sync' | 'auto';
  /**
   * Whether a failed image is replaced by the initial-letter tile.
   *
   * Defaults to true. Set false for a decorative *second* rendering of an
   * image that another layer already shows (the category hero's inset
   * photo over its blurred backdrop): when the image 404s, the surviving
   * layer already displays the failure and a second tile on top of it
   * would only double it.
   */
  renderFallback?: boolean;
  /**
   * Marks a content photo for the shared copy deterrent (Stage 28b):
   * `data-protected-image` plus `draggable={false}` on the real `<img>`.
   * UI artwork (partner/agent/brand logos) leaves this off.
   */
  protectedImage?: boolean;
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
  id,
  fit = 'cover',
  onLoad,
  loading = 'lazy',
  imgRef,
  sizes,
  fetchPriority,
  decoding = 'async',
  renderFallback = true,
  protectedImage = false,
}: ImageWithFallbackProps) {
  // Tracks *which* src failed rather than a bare flag, so pointing the
  // component at a different image (the gallery swaps its hero when a
  // thumbnail is clicked) re-attempts the load instead of leaving a stale
  // fallback tile on screen.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const failed = !src || failedSrc === src;

  // An eligible Cloudinary photo gets one warm connection before the first
  // photo is requested. React hoists the hint into the document head and
  // deduplicates repeated calls, so a grid of Cloudinary photos adds one
  // preconnect, not one per card. Pages that render no Cloudinary photo emit
  // nothing, which is why this cannot live unconditionally in the layout.
  if (src && isCloudinaryDeliveryUrl(src)) {
    preconnect('https://res.cloudinary.com');
  }

  // The two modes differ only in the box and the fit, so the initial-letter
  // fallback has to fill the same box as the artwork it stands in for.
  const boxClasses =
    fit === 'contain' ? 'h-full w-full' : 'aspect-video w-full';
  const fitClass = fit === 'contain' ? 'object-contain' : 'object-cover';

  if (failed) {
    if (!renderFallback) {
      return null;
    }
    const initial = alt.trim().charAt(0).toLocaleUpperCase() || '?';
    return (
      <div
        id={id}
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

  // Cloudinary photos are delivered responsively at render time; the stored
  // URL is never modified. A small default keeps non-srcset-aware browsers
  // and the preload scanner on a sensible derivative, and the srcset lets
  // every other browser pick by rendered width and DPR. Non-Cloudinary
  // sources (data URIs, picsum, local placeholders) pass through untouched
  // and get no srcset at all, so their markup is exactly as before.
  const deliveredSrc = src
    ? transformCloudinaryImageUrl(src, CLOUDINARY_DEFAULT_WIDTH)
    : src;
  const srcSet = src ? buildCloudinarySrcset(src) ?? undefined : undefined;

  // Plain <img> on purpose: real media + next/image optimization arrive
  // with Phase 0/14. next/image would need remotePatterns for future
  // storage URLs and gives nothing for local 404 placeholders.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      id={id}
      ref={imgRef}
      src={deliveredSrc}
      srcSet={srcSet}
      alt={alt}
      loading={loading}
      decoding={decoding}
      sizes={sizes}
      fetchPriority={fetchPriority}
      data-protected-image={protectedImage ? '' : undefined}
      draggable={protectedImage ? false : undefined}
      onLoad={(event) => onLoad?.(event.currentTarget)}
      onError={() => setFailedSrc(src)}
      className={`${boxClasses} ${fitClass} ${className ?? ''}`}
    />
  );
}
