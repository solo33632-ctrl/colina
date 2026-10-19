'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { KeyboardEvent, PointerEvent as ReactPointerEvent } from 'react';
import {
  DEFAULT_POSITION,
  MAX_POSITION,
  MIN_POSITION,
  keyToPosition,
  pointerToPercent,
} from '@/lib/before-after';

export type BeforeAfterSliderProps = {
  beforeSrc: string;
  afterSrc: string;
  /** Alt text for each photo. The card passes the item's name in each locale. */
  beforeAlt: string;
  afterAlt: string;
  /** The two corner pills, "Before" / "بعد". */
  beforeLabel: string;
  afterLabel: string;
  /** Accessible name of the handle, e.g. "Compare before and after". */
  sliderLabel: string;
  /**
   * The localized wording of the current split, e.g. "50% before", as an ICU
   * message containing a single `{percent}` placeholder.
   *
   * A TEMPLATE rather than a ready-made function: this is a Client Component
   * rendered by a Server Component, and Next.js will not let a function cross
   * that boundary. The template arrives as a plain string and is filled in
   * here. Where the number sits inside the sentence is the translator's call —
   * Arabic puts it first, English last — so the message carries the order and
   * this component only substitutes.
   */
  valueTextTemplate: string;
  /** `sizes` hint for the two images; the grid knows the width, this does not. */
  sizes?: string;
};

/**
 * A before/after comparison the visitor drags.
 *
 * Two photographs of the same machine, stacked and clipped against a divider
 * that moves. BEFORE is the base layer; AFTER is laid over it with
 * `clip-path: inset(0 0 0 var(--pos))`, which hides the part of the AFTER layer
 * to the LEFT of `--pos`. So the left of the frame is before, the right is
 * after, and moving `--pos` sweeps the reveal across.
 *
 * WHY NOTHING HERE MIRRORS IN ARABIC. The container is `dir="ltr"` and every
 * offset is physical (`left`, never `start`/`end`). Before-and-after is a
 * comparison of two photographs, and the reading order of the pictures is the
 * same in both languages: the earlier state is on the left. If the divider
 * mirrored, an Arabic visitor would have to learn that "before" sits on their
 * right and that the arrow keys move the other way. Pinning the direction keeps
 * one mental model across both locales; only the words change. The label text
 * sets its own `dir="auto"`, so Arabic labels still read correctly inside a
 * left-to-right box.
 *
 * WHY THE POSITION LIVES IN A CSS VARIABLE. Dragging writes `--pos` onto the
 * element through a ref and never calls `setState`, so a drag repaints two
 * layers instead of re-rendering the card, the grid and the page around it.
 * React state moves only on release and on a keypress — the moments the ARIA
 * values are worth announcing anyway. The inline `style` below keeps `--pos` at
 * the default for the SERVER-rendered HTML, so the divider is already in the
 * middle on first paint rather than flashing in at 0%; because that value never
 * changes, React leaves the imperative writes alone.
 *
 * NO MOTION. Nothing here animates: the clip follows the pointer exactly and a
 * keypress moves the divider in one step with no easing. A comparison that
 * drifts is one you cannot trust to the pixel, and a visitor who asked for less
 * motion gets none at all — so there is nothing here for `motion-reduce` to
 * switch off.
 */
export function BeforeAfterSlider({
  beforeSrc,
  afterSrc,
  beforeAlt,
  afterAlt,
  beforeLabel,
  afterLabel,
  sliderLabel,
  valueTextTemplate,
  sizes,
}: BeforeAfterSliderProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  // The committed position: everything the ARIA attributes read, so a screen
  // reader is never told about a drag it cannot see.
  const [position, setPosition] = useState(DEFAULT_POSITION);
  const frame = useRef<number | null>(null);

  /** The only writer of `--pos`. Batched to one write per animation frame. */
  const paint = useCallback((next: number) => {
    if (frame.current !== null) {
      cancelAnimationFrame(frame.current);
    }
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      containerRef.current?.style.setProperty('--pos', `${next}%`);
    });
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
      }
    },
    []
  );

  const percentFrom = useCallback((clientX: number) => {
    const node = containerRef.current;
    return node
      ? pointerToPercent(clientX, node.getBoundingClientRect())
      : DEFAULT_POSITION;
  }, []);

  /** "50% before" — the template with its single placeholder filled in. */
  const valueText = useCallback(
    (percent: number) =>
      valueTextTemplate.replace('{percent}', String(percent)),
    [valueTextTemplate]
  );

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    // Capture on the container rather than the handle: a drag that starts
    // anywhere on the photo is how people actually use one, and capture keeps
    // the events arriving after the pointer has left the element entirely.
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(percentFrom(event.clientX));
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    // Only while something is held. Without this a mouse merely passing over
    // the slider would drag it on its way to the page behind.
    if (event.buttons === 0) {
      return;
    }
    paint(percentFrom(event.clientX));
  }

  function endDrag(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    // The one moment the position becomes real React state.
    const next = percentFrom(event.clientX);
    paint(next);
    setPosition(next);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const result = keyToPosition(event.key, position, event.shiftKey);
    if (result.type === 'none') {
      return;
    }
    // Own the key: an unhandled ArrowLeft also scrolls the page sideways in an
    // RTL document, and Space scrolls it down.
    event.preventDefault();
    paint(result.position);
    setPosition(result.position);
  }

  return (
    <div
      ref={containerRef}
      dir="ltr"
      style={{ ['--pos' as string]: `${DEFAULT_POSITION}%` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      data-testid="before-after-slider"
      // `touch-pan-y`: the browser keeps vertical panning (so a swipe up the
      // page still scrolls it) and hands horizontal movement to us. The cursor
      // is a resize handle rather than a grab, because the handle is already
      // visibly an edge — though that is only a mouse affordance and is left
      // off the handle so a touch drag that starts there behaves the same.
      className="relative h-full w-full cursor-ew-resize touch-pan-y select-none overflow-hidden"
    >
      {/* BEFORE: the base layer, always whole. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeSrc}
        alt={beforeAlt}
        sizes={sizes}
        loading="lazy"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
      />
      {/* AFTER: the same box, clipped to the right of the divider. Identical
          `fit` and identical box to the layer beneath it, which is the only
          way the two photographs stay registered as the frame moves. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={afterSrc}
        alt={afterAlt}
        sizes={sizes}
        loading="lazy"
        draggable={false}
        className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover"
        style={{ clipPath: 'inset(0 0 0 var(--pos))' }}
      />

      {/* The corner labels. `pointer-events-none` so they can never swallow a
          drag that happens to start on one, and `dir="auto"` so the text reads
          in its own language inside an otherwise left-to-right box. */}
      <span className="pointer-events-none absolute left-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-sm font-bold text-white sm:text-base">
        <span dir="auto">{beforeLabel}</span>
      </span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-full bg-black/60 px-2.5 py-1 text-sm font-bold text-white sm:text-base">
        <span dir="auto">{afterLabel}</span>
      </span>

      {/* The divider line: a shadow rather than a border, because it has to
          stay legible over a photograph of any brightness. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_6px_rgba(0,0,0,0.55)]"
        style={{ left: 'var(--pos)' }}
      />

      {/* The handle — the only focusable thing in the component and the only
          thing a keyboard can reach, so it carries the whole slider contract. */}
      <div
        role="slider"
        tabIndex={0}
        aria-label={sliderLabel}
        aria-orientation="horizontal"
        aria-valuemin={MIN_POSITION}
        aria-valuemax={MAX_POSITION}
        aria-valuenow={position}
        aria-valuetext={valueText(position)}
        onKeyDown={onKeyDown}
        data-testid="before-after-handle"
        className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 select-none items-center justify-center rounded-full bg-white text-brand-700 shadow-lg ring-1 ring-black/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
        style={{ left: 'var(--pos)' }}
      >
        {/* Two chevrons, inline SVG: the point is which way the divider moves,
            and a chevron pair says that without needing a label. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-5 w-5"
        >
          <path d="m10 8-4 4 4 4" />
          <path d="m14 8 4 4-4 4" />
        </svg>
      </div>
    </div>
  );
}
