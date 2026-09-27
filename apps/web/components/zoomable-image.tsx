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
  lensStyle,
  MIN_LENS_SIZE,
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

const FRAME_CLASSES =
  'w-full overflow-hidden rounded-xl border border-stone-200 bg-stone-100';

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
  // whenever that changes. Writing to the DOM is exactly what an effect is
  // for.
  useEffect(() => {
    const lens = lensRef.current;
    if (lens) {
      lens.style.backgroundImage = `url("${src}")`;
    }
  }, [src]);

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
    if (!frame || !lens || !cursor || !natural) {
      return;
    }
    // Read the box first, then write: no interleaved read/write within a
    // frame, so no forced synchronous layout.
    const rect = frame.getBoundingClientRect();
    const style = lensStyle({
      container: { width: rect.width, height: rect.height },
      natural,
      cursor,
      zoom: ZOOM,
    });
    if (style.size < MIN_LENS_SIZE) {
      updateMeasure({ visible: false });
      return;
    }
    lens.style.setProperty('--lens-size', `${style.size}px`);
    lens.style.setProperty('--lens-x', `${style.offset.x}px`);
    lens.style.setProperty('--lens-y', `${style.offset.y}px`);
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
      loading="eager"
      imgRef={imgRef}
      onLoad={handleLoaded}
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
