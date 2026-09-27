// Pure geometry for the machine-gallery hover magnifier. Kept free of DOM
// and React so the maths is unit-testable (see `image-zoom.test.ts`) and so
// the component only has to measure and assign.
//
// Everything is expressed in physical CSS pixels measured from the image's
// own top-left corner. Nothing here reads the document direction, which is
// what makes the magnifier behave identically in the RTL (ar) and LTR (en)
// builds: the lens is positioned with `left`/`top` offsets and its
// background is offset with `background-position` *lengths*, neither of
// which is mirrored by `direction: rtl`.

/** A width/height pair in CSS pixels. */
export type Size = { width: number; height: number };

/** A point in CSS pixels. */
export type Point = { x: number; y: number };

/** How `object-fit: cover` paints an image inside its container. */
export type CoverGeometry = {
  /** Size the image is painted at before the container clips it. */
  rendered: Size;
  /**
   * Top-left corner of the painted box relative to the container. Negative
   * on an axis where the image overflows (the cropped-off side).
   */
  offset: Point;
};

/**
 * Reproduces the CSS `object-fit: cover` algorithm: scale the image up
 * until both axes are covered, then centre it.
 *
 * The magnifier has to magnify what the visitor actually *sees* — and with
 * `cover` that is a crop of the full image — so the lens math needs the
 * painted size and crop offset, not the natural size.
 */
export function coverGeometry(container: Size, natural: Size): CoverGeometry {
  const scale = Math.max(
    container.width / natural.width,
    container.height / natural.height
  );
  const width = natural.width * scale;
  const height = natural.height * scale;
  return {
    rendered: { width, height },
    offset: {
      x: (container.width - width) / 2,
      y: (container.height - height) / 2,
    },
  };
}

/** Upper bound for the lens, so it stays a lens and not a second hero. */
export const MAX_LENS_SIZE = 260;

/** Below this the lens is too small to be worth showing at all. */
export const MIN_LENS_SIZE = 160;

export function lensSize(container: Size): number {
  return Math.min(MAX_LENS_SIZE, container.width, container.height);
}

/** Keeps the lens fully inside the image instead of hanging off its edge. */
function clampAxis(value: number, min: number, max: number): number {
  // An empty range means the lens is larger than the container on this
  // axis; centre it rather than pinning it to an out-of-bounds edge.
  if (max < min) {
    return (min + max) / 2;
  }
  return Math.min(Math.max(value, min), max);
}

function round(value: number): number {
  // Sub-pixel lens offsets make the background shimmer while tracking the
  // cursor; two decimals is well below a rendered pixel at any DPR.
  return Math.round(value * 100) / 100;
}

export type LensStyle = {
  /** Side length of the square lens pane. */
  size: number;
  /** Lens pane offset inside the image, so the lens rides the cursor. */
  offset: Point;
  /** `background-size`: the on-screen image scaled up by `zoom`. */
  backgroundSize: string;
  /** `background-position`: places `cursor` at the centre of the pane. */
  backgroundPosition: string;
};

export function lensStyle({
  container,
  natural,
  cursor,
  zoom,
}: {
  container: Size;
  natural: Size;
  cursor: Point;
  zoom: number;
}): LensStyle {
  const { rendered, offset } = coverGeometry(container, natural);
  const size = lensSize(container);
  const centre = size / 2;
  return {
    size: round(size),
    offset: {
      x: round(clampAxis(cursor.x - centre, 0, container.width - size)),
      y: round(clampAxis(cursor.y - centre, 0, container.height - size)),
    },
    backgroundSize: `${round(rendered.width * zoom)}px ${round(
      rendered.height * zoom
    )}px`,
    // The point under the cursor sits at the pane's centre, so the pane
    // offset is the scaled distance from that point back to the image's
    // top-left corner. Length values, not percentages: percentages are
    // relative to (positioning area - image size), which collapses to a
    // no-op once the scaled image is wider than the pane — always the case
    // here.
    backgroundPosition: `${round(centre - (cursor.x - offset.x) * zoom)}px ${round(
      centre - (cursor.y - offset.y) * zoom
    )}px`,
  };
}
