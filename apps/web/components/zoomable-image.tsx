'use client';

import dynamic from 'next/dynamic';
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useTranslations } from 'next-intl';
import { ImageWithFallback } from './image-with-fallback';
import type { Size } from '@/lib/image-zoom';

// The magnifier is a fine-pointer-only extra: a phone never needs its geometry,
// pointer tracking or background pane. Importing it dynamically keeps that code
// out of the initial bundle and out of every touch visit.
const ZoomLens = dynamic(
  () => import('./zoom-lens').then((module) => module.ZoomLens),
  { ssr: false }
);

// A hover-capable, mouse-like pointer. This is the difference between a
// desktop mouse and a finger, so it is the right question to ask — a width
// check would wrongly enable the lens on a narrow desktop window, and
// disable it on a large tablet held in landscape.
const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';

function subscribeToPointerChange(onChange: () => void) {
  const query = window.matchMedia(FINE_POINTER_QUERY);
  query.addEventListener('change', onChange);
  return () => query.removeEventListener('change', onChange);
}

function hasFinePointer() {
  return window.matchMedia(FINE_POINTER_QUERY).matches;
}

// Module scope so the subscribe/getSnapshot identities are stable across
// renders, which is what useSyncExternalStore requires. The server snapshot
// is false: the markup is rendered for the touch path (no lens), and React
// re-renders with the real value straight after hydration.
const NO_POINTER = () => false;

// The frame owns the picture's proportions. `aspect-[4/3]` lives HERE and never
// on the <img>, which is the rule the category tiles and machine cards already
// follow: `ImageWithFallback` only applies `aspect-video` itself in its default
// `cover` mode, so asking the image for a ratio as well would put two
// `aspect-ratio` declarations on one element and leave stylesheet order to
// decide which wins — which is how this hero ended up cropping production-line
// photos to 16:9 in the first place.
//
// Because the ratio is on the frame, the frame's height is identical for every
// photo whatever its proportions, so switching between a 400x900 portrait, a
// 1600x500 panorama and a square shot moves nothing on the page.
const FRAME_CLASSES =
  'block aspect-[4/3] w-full overflow-hidden rounded-2xl bg-gradient-to-b from-stone-50 to-stone-100 ring-1 ring-stone-200';

// The photo's margin, carried on the image itself: Tailwind's preflight sets
// `box-sizing: border-box`, so this padding is carved out of the image's own
// box and `object-contain` fits the picture inside what is left — the artwork
// keeps an air gap without a wrapper element in between.
const PHOTO_CLASSES = 'p-3 sm:p-4';

type ZoomableImageProps = {
  src: string;
  alt: string;
  /** Omitted when there is nothing to enlarge (image failed to load). */
  onOpen?: () => void;
  onImageLoad?: () => void;
};

/**
 * The gallery's hero image.
 *
 * The photo is shown COMPLETE: the frame owns a fixed `aspect-[4/3]` ratio and
 * the image is `object-contain` inside it, letterboxed rather than cropped. A
 * production-line photo cropped to fill its frame loses the top of the machine
 * — which is exactly what the owner reported — so `contain` is not a stylistic
 * preference here, it is the correction.
 *
 * On a hover-capable pointer, moving over the image shows a lens that
 * magnifies the part under the cursor. That lens is imported on demand; on a
 * touch pointer the code is never fetched at all and the image becomes a
 * button that opens the lightbox instead.
 */
export function ZoomableImage({
  src,
  alt,
  onOpen,
  onImageLoad,
}: ZoomableImageProps) {
  const t = useTranslations('MachinePage');
  const canHover = useSyncExternalStore(
    subscribeToPointerChange,
    hasFinePointer,
    NO_POINTER
  );
  const frameRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  // Measurements are tagged with the `src` they describe. Deriving validity
  // from that tag during render is React's documented alternative to
  // resetting state in an effect: when the hero swaps, the previous image's
  // size is simply no longer the current one, with no cascading render.
  const [measure, setMeasure] = useState<{
    src: string;
    size: Size | null;
  }>({ src, size: null });

  if (measure.src !== src) {
    setMeasure({ src, size: null });
  }
  const natural = measure.src === src ? measure.size : null;

  const handleLoaded = useCallback(
    (element: HTMLImageElement) => {
      setMeasure({
        src,
        size: {
          width: element.naturalWidth,
          height: element.naturalHeight,
        },
      });
      onImageLoad?.();
    },
    [onImageLoad, src]
  );

  // A hero image served from the browser cache can finish loading before
  // React hydrates, so its `load` event is never observed and `onLoad` never
  // runs. Without this the magnifier and the enlarge button would silently
  // stay disabled on any repeat visit.
  useEffect(() => {
    const element = imgRef.current;
    // `complete` is also true for a failed image, hence the width check.
    if (element?.complete && element.naturalWidth > 0) {
      handleLoaded(element);
    }
  }, [handleLoaded, imgRef, src]);

  const image = (
    <ImageWithFallback
      src={src}
      alt={alt}
      // `contain` is the whole point of this component now: the photo is shown
      // whole, letterboxed inside the frame's fixed ratio, instead of cropped to
      // fill it.
      fit="contain"
      // The frame is the page's largest contentful paint candidate, so this one
      // image is fetched eagerly at high priority. The thumbnails — and this
      // photo once it is not the one on screen — stay lazy.
      loading="eager"
      fetchPriority="high"
      sizes="(min-width: 1024px) 46rem, 100vw"
      imgRef={imgRef}
      onLoad={handleLoaded}
      protectedImage
      className={PHOTO_CLASSES}
    />
  );

  return (
    <div ref={frameRef} className="relative">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          aria-label={t('openImageLabel')}
          className={`${FRAME_CLASSES} block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
        >
          {image}
        </button>
      ) : (
        <div className={FRAME_CLASSES}>{image}</div>
      )}

      {canHover ? (
        <ZoomLens
          src={src}
          natural={natural}
          frameRef={frameRef}
          imgRef={imgRef}
        />
      ) : null}
    </div>
  );
}
