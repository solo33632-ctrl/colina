'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { useTranslations } from 'next-intl';
import {
  CLOUDINARY_MAX_WIDTH,
  transformCloudinaryImageUrl,
} from '@/lib/cloudinary-delivery';
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

type ZoomLensProps = {
  /** The active hero photo, used for the lens background. */
  src: string;
  /** Natural size of the loaded hero, or null until it decodes. */
  natural: Size | null;
  /** The frame the pointer travels over. */
  frameRef: RefObject<HTMLDivElement | null>;
  /** The photo, whose padding defines the painted content box. */
  imgRef: RefObject<HTMLImageElement | null>;
};

/**
 * The gallery's hover magnifier, split out so its geometry and pane ship only
 * to fine-pointer devices.
 *
 * The parent (`zoomable-image.tsx`) renders the hero image itself on every
 * device. Only after the browser confirms `(hover: hover) and (pointer: fine)`
 * is this module imported, so a phone never downloads the lens code. The
 * markup and behaviour on a fine pointer are exactly what they were when this
 * lived in the parent: the pane is present but `hidden` until the pointer is
 * over the painted photo, and works on letterboxed images by converting the
 * frame box into the image's content box first.
 *
 * Per-move geometry is written straight to CSS custom properties on the lens
 * element rather than through React state: a mousemove fires far more often
 * than React should re-render, and reading the frame's box once per animation
 * frame keeps this off the layout-thrash path.
 */
export function ZoomLens({ src, natural, frameRef, imgRef }: ZoomLensProps) {
  const t = useTranslations('MachinePage');
  const lensRef = useRef<HTMLDivElement>(null);
  const frameRequestRef = useRef<number | null>(null);
  const cursorRef = useRef<Point | null>(null);
  const [visible, setVisible] = useState(false);

  // The lens shows the image it is given, so it has to be re-pointed
  // whenever that changes — AND whenever the lens itself appears, which is a
  // separate event: the pane is only rendered on the hover path, and at mount
  // that is not yet true, so `lensRef.current` is null and this effect no-ops.
  // Writing to the DOM is exactly what an effect is for.
  useEffect(() => {
    const lens = lensRef.current;
    if (lens) {
      // Magnify the largest derivative rather than whichever srcset entry the
      // hero happened to pick: at 2.5x a 400w candidate would be visibly soft.
      // `c_limit` preserves the aspect ratio, so the geometry above — which is
      // derived from the hero's natural size — still describes this image.
      lens.style.backgroundImage = `url("${transformCloudinaryImageUrl(
        src,
        CLOUDINARY_MAX_WIDTH
      )}")`;
    }
  }, [src]);

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
      setVisible(false);
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
      setVisible(false);
      return;
    }
    const pane = translatePoint(style.offset, insets.left, insets.top);
    lens.style.setProperty('--lens-size', `${style.size}px`);
    lens.style.setProperty('--lens-x', `${pane.x}px`);
    lens.style.setProperty('--lens-y', `${pane.y}px`);
    lens.style.setProperty('--zoom-size', style.backgroundSize);
    lens.style.setProperty('--zoom-position', style.backgroundPosition);
    setVisible(true);
  }, [frameRef, imgRef, natural]);

  // The pointer listeners live on the frame, which is the same box the hero
  // button occupies. They are attached natively so a move that starts on the
  // letterbox padding still reaches the lens.
  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      const rect = frame.getBoundingClientRect();
      cursorRef.current = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
      };
      // Coalesce bursts of moves into a single write per frame.
      if (frameRequestRef.current === null) {
        frameRequestRef.current = requestAnimationFrame(applyLens);
      }
    };

    const onPointerLeave = () => {
      cursorRef.current = null;
      cancelPendingFrame();
      setVisible(false);
    };

    frame.addEventListener('pointermove', onPointerMove);
    frame.addEventListener('pointerleave', onPointerLeave);
    return () => {
      frame.removeEventListener('pointermove', onPointerMove);
      frame.removeEventListener('pointerleave', onPointerLeave);
      cancelPendingFrame();
    };
  }, [applyLens, cancelPendingFrame, frameRef]);

  return (
    <>
      <div
        ref={lensRef}
        // The only handle a test has on the lens: it is `aria-hidden`, has
        // no role and no text, and nothing else on the page shares its
        // class string except the zoom hint, which is also `rounded-full`.
        data-testid="zoom-lens"
        aria-hidden="true"
        className={`pointer-events-none absolute rounded-full border-2 border-white bg-no-repeat shadow-lg ring-1 ring-stone-900/10 left-[var(--lens-x)] top-[var(--lens-y)] h-[var(--lens-size)] w-[var(--lens-size)] bg-[length:var(--zoom-size)] bg-[position:var(--zoom-position)] ${
          visible ? 'block' : 'hidden'
        }`}
      />
      {visible ? (
        <p
          aria-hidden="true"
          className="pointer-events-none absolute end-3 top-3 rounded-full bg-stone-900/60 px-3 py-1 text-xs text-white"
        >
          {t('zoomHint')}
        </p>
      ) : null}
    </>
  );
}
