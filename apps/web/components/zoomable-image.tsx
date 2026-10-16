'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { useTranslations } from 'next-intl';
import { ImageWithFallback } from './image-with-fallback';
import {
  contentBox,
  lensStyle,
  MIN_LENS_SIZE,
  translatePoint,
  type Point,
  type Size,
} from '@/lib/image-zoom';

// How much the lens magnifies. 2.5x keeps fine detail legible without the
// zoomed pane drifting so far from the cursor that it loses context.
const ZOOM = 2.5;

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
 * magnifies the part under the cursor. On a touch pointer the lens is
 * skipped entirely and the image becomes a button that opens the
 * lightbox instead.
 *
 * Per-move geometry is written straight to CSS custom properties on the
 * lens element rather than through React state: a mousemove fires far more
 * often than React should re-render, and reading the frame's box once per
 * animation frame keeps this off the layout-thrash path.
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
  const lensRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const frameRequestRef = useRef<number | null>(null);
  const cursorRef = useRef<Point | null>(null);
  // Measurements are tagged with the `src` they describe. Deriving validity
  // from that tag during render is React's documented alternative to
  // resetting state in an effect: when the hero swaps, the previous
  // image's size and lens visibility are simply no longer the current
  // ones, with no cascading render to do it.
  const [measure, setMeasure] = useState<{
    src: string;
    size: Size | null;
    visible: boolean;
  }>({ src, size: null, visible: false });

  if (measure.src !== src) {
    setMeasure({ src, size: null, visible: false });
  }
  const natural = measure.src === src ? measure.size : null;
  const lensVisible = measure.src === src && measure.visible;

  // The lens shows the image it is given, so it has to be re-pointed
  // whenever that changes — AND whenever the lens itself appears, which is a
  // separate event: the pane is only rendered on the hover path, and at mount
  // that is not yet true, so `lensRef.current` is null and this effect no-ops.
  // Writing to the DOM is exactly what an effect is for.
  useEffect(() => {
    const lens = lensRef.current;
    if (lens) {
      lens.style.backgroundImage = `url("${src}")`;
    }
  }, [src, canHover]);

  const updateMeasure = useCallback(
    (patch: { size?: Size | null; visible?: boolean }) => {
      setMeasure((previous) =>
        previous.src === src ? { ...previous, ...patch } : previous
      );
    },
    [src]
  );

  const cancelPendingFrame = useCallback(() => {
    if (frameRequestRef.current !== null) {
      cancelAnimationFrame(frameRequestRef.current);
      frameRequestRef.current = null;
    }
  }, []);

  const applyLens = useCallback(() => {
    frameRequestRef.current = null;
    const frame = frameRef.current;
    const lens = lensRef.current;
    const cursor = cursorRef.current;
    const image = imgRef.current;
    if (!frame || !lens || !cursor || !natural || !image) {
      return;
    }
    // Read first, then write: no interleaved read/write within a frame, so no
    // forced synchronous layout.
    const rect = frame.getBoundingClientRect();
    // The photo is letterboxed inside the IMAGE's content box, which is the
    // frame less the padding that keeps the artwork off the edges. Using the
    // frame itself here would magnify the padding as if it were part of the
    // picture, so both the geometry and the cursor are converted into content
    // coordinates before any maths happens — and the lens position is
    // converted back on the way out.
    const imageStyle = getComputedStyle(image);
    const insets = {
      top: Number.parseFloat(imageStyle.paddingTop) || 0,
      right: Number.parseFloat(imageStyle.paddingRight) || 0,
      bottom: Number.parseFloat(imageStyle.paddingBottom) || 0,
      left: Number.parseFloat(imageStyle.paddingLeft) || 0,
    };
    const container = contentBox(
      { width: rect.width, height: rect.height },
      insets
    );
    if (container.width <= 0 || container.height <= 0) {
      updateMeasure({ visible: false });
      return;
    }
    const style = lensStyle({
      container,
      natural,
      cursor: translatePoint(cursor, -insets.left, -insets.top),
      zoom: ZOOM,
    });
    // `overPhoto` is false on a letterbox bar: there is nothing there to
    // magnify, so the lens is hidden rather than showing a pane of grey.
    if (style.size < MIN_LENS_SIZE || !style.overPhoto) {
      updateMeasure({ visible: false });
      return;
    }
    const pane = translatePoint(style.offset, insets.left, insets.top);
    lens.style.setProperty('--lens-size', `${style.size}px`);
    lens.style.setProperty('--lens-x', `${pane.x}px`);
    lens.style.setProperty('--lens-y', `${pane.y}px`);
    lens.style.setProperty('--zoom-size', style.backgroundSize);
    lens.style.setProperty('--zoom-position', style.backgroundPosition);
    updateMeasure({ visible: true });
  }, [natural, updateMeasure]);

  const handlePointerMove = useCallback(
    (event: ReactPointerEvent<HTMLElement>) => {
      if (!canHover) {
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      cursorRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      // Coalesce bursts of moves into a single write per frame.
      if (frameRequestRef.current === null) {
        frameRequestRef.current = requestAnimationFrame(applyLens);
      }
    },
    [applyLens, canHover]
  );

  const handlePointerLeave = useCallback(() => {
    cursorRef.current = null;
    cancelPendingFrame();
    updateMeasure({ visible: false });
  }, [cancelPendingFrame, updateMeasure]);

  useEffect(() => cancelPendingFrame, [cancelPendingFrame]);

  const handleLoaded = useCallback(
    (element: HTMLImageElement) => {
      updateMeasure({
        size: {
          width: element.naturalWidth,
          height: element.naturalHeight,
        },
      });
      onImageLoad?.();
    },
    [onImageLoad, updateMeasure]
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
      className={PHOTO_CLASSES}
    />
  );

  return (
    <div ref={frameRef} className="relative">
      {onOpen ? (
        <button
          type="button"
          onClick={onOpen}
          onPointerMove={handlePointerMove}
          onPointerLeave={handlePointerLeave}
          aria-label={t('openImageLabel')}
          className={`${FRAME_CLASSES} block cursor-zoom-in focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600`}
        >
          {image}
        </button>
      ) : (
        <div className={FRAME_CLASSES}>{image}</div>
      )}

      {canHover ? (
        <>
          <div
            ref={lensRef}
            // The only handle a test has on the lens: it is `aria-hidden`, has
            // no role and no text, and nothing else on the page shares its
            // class string except the zoom hint, which is also `rounded-full`.
            data-testid="zoom-lens"
            aria-hidden="true"
            className={`pointer-events-none absolute rounded-full border-2 border-white bg-no-repeat shadow-lg ring-1 ring-stone-900/10 left-[var(--lens-x)] top-[var(--lens-y)] h-[var(--lens-size)] w-[var(--lens-size)] bg-[length:var(--zoom-size)] bg-[position:var(--zoom-position)] ${
              lensVisible ? 'block' : 'hidden'
            }`}
          />
          {lensVisible ? (
            <p
              aria-hidden="true"
              className="pointer-events-none absolute end-3 top-3 rounded-full bg-stone-900/60 px-3 py-1 text-xs text-white"
            >
              {t('zoomHint')}
            </p>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
